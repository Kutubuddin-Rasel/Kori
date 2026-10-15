import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { validate } from '../src/config/env.validation';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { configureApp } from 'src/app.setup';
import request from 'supertest';
import { randomInt, randomUUID } from 'crypto';

describe('Auth lifecycle (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  const ownedUserIds: string[] = [];
  const ownedPhones = new Set<string>();
  const challengeKeys = new Set<string>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate,
        }),
        PrismaModule,
        RedisModule,
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        for (const userId of ownedUserIds) {
          await prisma.trustDevice.deleteMany({ where: { userId } });
          await prisma.wallet.deleteMany({ where: { userId } });
          await prisma.user.delete({ where: { id: userId } });
        }
      }

      if (redis) {
        for (const key of challengeKeys) {
          await redis.del(key);
        }

        for (const phone of ownedPhones) {
          const keys = [
            `auth:otp:{${phone}}:active`,
            `auth:otp:{${phone}}:resend`,
            `auth:otp:{${phone}}:failures`,
            `auth:registration:{${phone}}:authorization`,
            `auth:device-enrollment:{${phone}}:authorization`,
            `auth:login:failures:${phone}`,
            `auth:login:throttle:${phone}`,
          ];

          for (const key of keys) {
            await redis.del(key);
          }
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  function newPhone(): string {
    return `+88017${randomInt(10_000_000, 100_000_000)}`;
  }

  function newDeviceId(): string {
    return `phase18-${randomUUID()}`;
  }

  async function issueTestOtp(
    phone: string,
    deviceId: string,
  ): Promise<{ challengeId: string; otp: string }> {
    ownedPhones.add(phone);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({ phone, deviceId })
      .expect(200);

    const challengeId = response.body.challengeId as string;
    const key = `auth:otp:{${phone}}:challenge:${challengeId}`;

    challengeKeys.add(key);

    const challenge = await redis.getStrict<{
      phone: string;
      deviceId: string;
      code: string;
    }>(key);

    if (!challenge) {
      throw new Error('Test OTP challenge not found in Redis');
    }

    expect(challenge.phone).toBe(phone);
    expect(challenge.deviceId).toBe(deviceId);
    expect(challenge.code).toMatch(/^\d{6}$/);

    return { challengeId, otp: challenge.code };
  }

  async function registerUserThroughHttp() {
    const phone = newPhone();
    const deviceId = newDeviceId();
    const pin = '1234';

    const otpChallenge = await issueTestOtp(phone, deviceId);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({
        phone,
        deviceId,
        challengeId: otpChallenge.challengeId,
        otp: otpChallenge.otp,
      })
      .expect(200);

    expect(verified.body.isRegistered).toBe(false);

    const registrationToken = verified.body.registrationAuthorization
      ?.token as string;

    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        phone,
        deviceId,
        pin,
        registrationToken,
      })
      .expect(201);

    expect(registered.body.accessToken).toEqual(expect.any(String));

    const user = await prisma.user.findUniqueOrThrow({
      where: { phone },
      include: { wallet: true },
    });

    ownedUserIds.push(user.id);

    expect(user.wallet).not.toBeNull();

    return {
      userId: user.id,
      walletId: user.wallet!.id,
      phone,
      deviceId,
      pin,
      registrationToken,
      accessToken: registered.body.accessToken as string,
    };
  }

  function refreshCookieFrom(response: {
    headers: Record<string, unknown>;
  }): string {
    const setCookie = response.headers['set-cookie'] as string[] | undefined;

    if (!Array.isArray(setCookie)) {
      throw new Error('No Set-Cookie response header');
    }

    const header = setCookie.find((value: string) =>
      value.startsWith('refresh_token='),
    );

    if (!header) {
      throw new Error('Refresh cookie not found');
    }

    return header.split(';')[0];
  }

  it('completes registration including: authenticated request, login, refresh, logout', async () => {
    const user = await registerUserThroughHttp();

    // 1. Registration access token works on an actual protected route.
    const balance = await request(app.getHttpServer())
      .get('/api/v1/wallets/my-balance')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(balance.body.currency).toBe('BDT');
    expect(balance.body.balance).toBe('0');

    // 2. Login on the already trusted device.
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: user.deviceId,
      })
      .expect(200);

    const cookieA = refreshCookieFrom(login);

    // 3. Refresh rotates the current credential.
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA)
      .expect(200);

    const cookieB = refreshCookieFrom(refreshed);

    expect(cookieB).not.toBe(cookieA);

    // 4. Logout using the current refresh cookie.
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieB)
      .expect(204);

    const clearingHeaders = logout.headers['set-cookie'] as unknown as
      | string[]
      | undefined;

    expect(
      clearingHeaders?.some(
        (header) =>
          header.startsWith('refresh_token=') &&
          header.includes('Path=/api/v1/auth'),
      ),
    ).toBe(true);

    // 5. PostgreSQL no longer authorizes refresh.
    const device = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: {
          userId: user.userId,
          deviceId: user.deviceId,
        },
      },
    });

    expect(device.isAuthorized).toBe(true);
    expect(device.refreshSessionId).toBeNull();
    expect(device.currentRefreshJti).toBeNull();

    // 6. The previous refresh credential cannot obtain another token.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieB)
      .expect(401);

    // 7. Repeating logout is safe.
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieB)
      .expect(204);

    // 8. Device remains trusted, so PIN login works again.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: user.deviceId,
      })
      .expect(200);
  });

  it('requires PIN + OTP before enrolling and later revoking a new device', async () => {
    const user = await registerUserThroughHttp();

    const secondDeviceId = newDeviceId();

    // 1. PIN is correct, but this device is not trusted.
    const firstLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: secondDeviceId,
      })
      .expect(403);

    expect(firstLogin.body.code).toBe('DEVICE_VERIFICATION_REQUIRED');

    const enrollmentToken = firstLogin.body.details
      .deviceEnrollmentToken as string;

    expect(enrollmentToken).toEqual(expect.any(String));

    // Clear the resend otp key to avoid 15 minutes cooldown.
    await redis.del(`auth:otp:{${user.phone}}:resend`);
    // 2. Request OTP on the second device.
    const challenge = await issueTestOtp(user.phone, secondDeviceId);

    // 3. Verify OTP and present the PIN-derived proof.
    const verification = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({
        phone: user.phone,
        deviceId: secondDeviceId,
        challengeId: challenge.challengeId,
        otp: challenge.otp,
        deviceEnrollmentToken: enrollmentToken,
      })
      .expect(200);

    expect(verification.body.isRegistered).toBe(true);

    // 4. Device enrollment is complete. Login again.
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: secondDeviceId,
      })
      .expect(200);

    const newDeviceAccessToken = login.body.accessToken as string;

    const newDeviceRefreshCookie = refreshCookieFrom(login);

    // 5. List actual owned device records.
    const devices = await request(app.getHttpServer())
      .get('/api/v1/auth/devices')
      .set('Authorization', `Bearer ${newDeviceAccessToken}`)
      .expect(200);

    const secondDevice = devices.body.find(
      (item: { deviceId: string }) => item.deviceId === secondDeviceId,
    );

    expect(secondDevice).toBeDefined();
    expect(secondDevice.isAuthorized).toBe(true);

    // 6. Revoke the second device.
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/devices/${secondDevice.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(204);

    const state = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: {
          userId: user.userId,
          deviceId: secondDeviceId,
        },
      },
    });

    expect(state.isAuthorized).toBe(false);
    expect(state.refreshSessionId).toBeNull();
    expect(state.currentRefreshJti).toBeNull();

    // 7. The old refresh cookie cannot renew its session.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', newDeviceRefreshCookie)
      .expect(401);

    // 8. PIN alone is no longer enough to trust this device.
    const loginAfterRevocation = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: secondDeviceId,
      })
      .expect(403);

    expect(loginAfterRevocation.body.code).toBe('DEVICE_VERIFICATION_REQUIRED');
  });

  it('rejects a previously issued JWT after account suspension', async () => {
    const user = await registerUserThroughHttp();

    await prisma.user.update({
      where: { id: user.userId },
      data: { status: 'SUSPENDED' },
    });

    await request(app.getHttpServer())
      .get('/api/v1/wallets/my-balance')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
  });

  it('does not trust stale ADMIN claims', async () => {
    const user = await registerUserThroughHttp();

    await prisma.user.update({
      where: { id: user.userId },
      data: { role: 'ADMIN' },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: user.deviceId,
      })
      .expect(200);

    const adminAccessToken = login.body.accessToken as string;

    // Current role has changed after token issuance.
    await prisma.user.update({
      where: { id: user.userId },
      data: { role: 'CUSTOMER' },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/wallets/${user.walletId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(403);
  });

  it('rejects a reused registration authorization', async () => {
    const user = await registerUserThroughHttp();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        phone: user.phone,
        deviceId: user.deviceId,
        pin: user.pin,
        registrationToken: user.registrationToken,
      })
      .expect(401);

    const accounts = await prisma.user.count({
      where: { phone: user.phone },
    });

    expect(accounts).toBe(1);
  });

  it('prevents cross-user trusted-device revocation', async () => {
    const userA = await registerUserThroughHttp();
    const userB = await registerUserThroughHttp();

    const deviceB = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: {
          userId: userB.userId,
          deviceId: userB.deviceId,
        },
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/devices/${deviceB.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);

    const unchanged = await prisma.trustDevice.findUniqueOrThrow({
      where: { id: deviceB.id },
    });

    expect(unchanged.isAuthorized).toBe(true);
    expect(unchanged.refreshSessionId).toBe(deviceB.refreshSessionId);
    expect(unchanged.currentRefreshJti).toBe(deviceB.currentRefreshJti);
  });

  it('throttles repeated invalid PIN attempts', async () => {
    const user = await registerUserThroughHttp();

    const maxFailures = app
      .get(ConfigService)
      .getOrThrow<number>('LOGIN_MAX_FAILURES');

    for (let attempt = 1; attempt <= maxFailures; attempt++) {
      const expectedStatus = attempt === maxFailures ? 429 : 401;

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: '9999',
          deviceId: user.deviceId,
        })
        .expect(expectedStatus);
    }

    // A subsequent correct PIN should still be blocked
    // while the throttle window remains active.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: user.phone,
        pin: user.pin,
        deviceId: user.deviceId,
      })
      .expect(429);
  });
});
