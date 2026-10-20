import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { validate } from '../src/config/env.validation';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { configureApp } from 'src/app.setup';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomInt, randomUUID } from 'crypto';

interface SendOtpHttpDto {
  challengeId: string;
}

interface VerifyOtpHttpDto {
  isRegistered: boolean;
  registrationAuthorization?: {
    token: string;
    expiresInSeconds: number;
  };
  deviceEnrollmentAuthorization?: {
    token: string;
    expiresInSeconds: number;
  };
}

interface AuthTokenHttpDto {
  accessToken: string;
  user?: {
    id: string;
    phone: string;
    role: string;
    status: string;
  };
}

interface WalletBalanceHttpDto {
  currency: string;
  balance: string;
  id?: string;
  type?: string;
  isActive?: boolean;
}

interface DeviceHttpRecord {
  id: string;
  deviceId: string;
  isAuthorized: boolean;
  lastUsedAt?: string;
}

interface ErrorEnvelopeHttpDto {
  success?: boolean;
  statusCode?: number;
  code?: string;
  message?: string | string[];
  path?: string;
  details?: {
    deviceEnrollmentToken?: string;
    [key: string]: unknown;
  };
}

type SupertestTarget = Parameters<typeof request>[0];

describe('Auth lifecycle (E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let server: SupertestTarget;

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

    server = app.getHttpServer() as unknown as SupertestTarget;
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
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

    const response = await request(server)
      .post('/api/v1/auth/send-otp')
      .send({ phone, deviceId })
      .expect(200);

    const body = response.body as unknown as SendOtpHttpDto;
    const challengeId = body.challengeId;
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

    const verified = await request(server)
      .post('/api/v1/auth/verify-otp')
      .send({
        phone,
        deviceId,
        challengeId: otpChallenge.challengeId,
        otp: otpChallenge.otp,
      })
      .expect(200);

    const verifiedBody = verified.body as unknown as VerifyOtpHttpDto;
    expect(verifiedBody.isRegistered).toBe(false);

    const registrationToken = verifiedBody.registrationAuthorization
      ?.token as string;

    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({
        phone,
        deviceId,
        pin,
        registrationToken,
      })
      .expect(201);

    const registeredBody = registered.body as unknown as AuthTokenHttpDto;
    expect(registeredBody.accessToken).toEqual(expect.any(String) as unknown);

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
      accessToken: registeredBody.accessToken,
    };
  }

  function refreshCookieFrom(response: {
    headers: Record<string, unknown>;
  }): string {
    const rawSetCookie = response.headers['set-cookie'];

    if (!Array.isArray(rawSetCookie)) {
      throw new Error('No Set-Cookie response header');
    }

    const setCookie = rawSetCookie as string[];

    const header = setCookie.find((value) =>
      value.startsWith('refresh_token='),
    );

    if (!header) {
      throw new Error('Refresh cookie not found');
    }

    return header.split(';')[0];
  }

  describe('Customer Registration & Complete Session Flow', () => {
    it('should complete registration, authenticate requests, perform PIN login, rotate refresh tokens, and log out cleanly', async () => {
      const user = await registerUserThroughHttp();

      // 1. Registration access token works on an actual protected route.
      const balance = await request(server)
        .get('/api/v1/wallets/my-balance')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const balanceBody = balance.body as unknown as WalletBalanceHttpDto;
      expect(balanceBody.currency).toBe('BDT');
      expect(balanceBody.balance).toBe('0');

      // 2. Login on the already trusted device.
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);

      const loginCookie = refreshCookieFrom(login);

      // 3. Refresh rotation gives a new cookie and new access token.
      const refresh = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', loginCookie)
        .expect(200);

      const refreshedCookie = refreshCookieFrom(refresh);
      expect(refreshedCookie).not.toBe(loginCookie);

      // 4. Old refresh cookie is invalidated.
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', loginCookie)
        .expect(401);

      // 5. Logout clears the cookie and removes database session.
      const logout = await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', refreshedCookie)
        .expect(204);

      const setCookies = logout.headers['set-cookie'] as unknown as
        | string[]
        | undefined;
      expect(
        setCookies?.some((cookie) => cookie.startsWith('refresh_token=;')),
      ).toBe(true);

      const device = await prisma.trustDevice.findUniqueOrThrow({
        where: {
          userId_deviceId: {
            userId: user.userId,
            deviceId: user.deviceId,
          },
        },
      });

      expect(device.refreshSessionId).toBeNull();
      expect(device.currentRefreshJti).toBeNull();

      // 6. Refreshed cookie can no longer be used after logout.
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshedCookie)
        .expect(401);

      // 7. But trusted device can login again directly with PIN.
      await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);
    });
  });

  describe('Multi-Device Enrollment & Revocation', () => {
    it('should require PIN verification and OTP confirmation before enrolling a new device, and allow subsequent revocation', async () => {
      const user = await registerUserThroughHttp();

      const secondDeviceId = newDeviceId();

      // 1. PIN is correct, but this device is not trusted.
      const firstLogin = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: secondDeviceId,
        })
        .expect(403);

      const firstLoginBody = firstLogin.body as unknown as ErrorEnvelopeHttpDto;
      expect(firstLoginBody.code).toBe('DEVICE_VERIFICATION_REQUIRED');

      const enrollmentToken = firstLoginBody.details
        ?.deviceEnrollmentToken as string;

      expect(enrollmentToken).toEqual(expect.any(String) as unknown);

      // Clear the resend otp key to avoid 15 minutes cooldown.
      await redis.del(`auth:otp:{${user.phone}}:resend`);
      // 2. Request OTP on the second device.
      const challenge = await issueTestOtp(user.phone, secondDeviceId);

      // 3. Verify OTP and present the PIN-derived proof.
      const verification = await request(server)
        .post('/api/v1/auth/verify-otp')
        .send({
          phone: user.phone,
          deviceId: secondDeviceId,
          challengeId: challenge.challengeId,
          otp: challenge.otp,
          deviceEnrollmentToken: enrollmentToken,
        })
        .expect(200);

      const verificationBody = verification.body as unknown as VerifyOtpHttpDto;
      expect(verificationBody.isRegistered).toBe(true);

      // 4. Device enrollment is complete. Login again.
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: secondDeviceId,
        })
        .expect(200);

      const loginBody = login.body as unknown as AuthTokenHttpDto;
      const newDeviceAccessToken = loginBody.accessToken;
      const newDeviceRefreshCookie = refreshCookieFrom(login);

      // 5. List actual owned device records.
      const devices = await request(server)
        .get('/api/v1/auth/devices')
        .set('Authorization', `Bearer ${newDeviceAccessToken}`)
        .expect(200);

      const deviceList = devices.body as unknown as DeviceHttpRecord[];
      const secondDevice = deviceList.find(
        (item: DeviceHttpRecord) => item.deviceId === secondDeviceId,
      );

      expect(secondDevice).toBeDefined();
      expect(secondDevice?.isAuthorized).toBe(true);

      // 6. Revoke the second device.
      await request(server)
        .delete(`/api/v1/auth/devices/${secondDevice!.id}`)
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
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', newDeviceRefreshCookie)
        .expect(401);

      // 8. PIN alone is no longer enough to trust this device.
      const loginAfterRevocation = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: secondDeviceId,
        })
        .expect(403);

      const loginAfterBody =
        loginAfterRevocation.body as unknown as ErrorEnvelopeHttpDto;
      expect(loginAfterBody.code).toBe('DEVICE_VERIFICATION_REQUIRED');
    });
  });

  describe('Account Suspension & Claims Validation', () => {
    it('should immediately reject previously issued access tokens after administrative account suspension', async () => {
      const user = await registerUserThroughHttp();

      await prisma.user.update({
        where: { id: user.userId },
        data: { status: 'SUSPENDED' },
      });

      await request(server)
        .get('/api/v1/wallets/my-balance')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(403);
    });

    it('should reject stale administrator privileges when access JWT claims do not match current database state', async () => {
      const user = await registerUserThroughHttp();

      await prisma.user.update({
        where: { id: user.userId },
        data: { role: 'ADMIN' },
      });

      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);

      const loginBody = login.body as unknown as AuthTokenHttpDto;
      const adminAccessToken = loginBody.accessToken;

      // Current role has changed after token issuance.
      await prisma.user.update({
        where: { id: user.userId },
        data: { role: 'CUSTOMER' },
      });

      await request(server)
        .get(`/api/v1/wallets/${user.walletId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(403);
    });
  });

  describe('Security Controls & Attack Mitigation', () => {
    it('should prevent reuse of an already-consumed registration authorization token', async () => {
      const user = await registerUserThroughHttp();

      await request(server)
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

    it('should prevent cross-user trusted-device revocation attempts', async () => {
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

      await request(server)
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

    it('should throttle repeated invalid PIN attempts to prevent brute-force attacks', async () => {
      const user = await registerUserThroughHttp();

      const maxFailures = app
        .get(ConfigService)
        .getOrThrow<number>('LOGIN_MAX_FAILURES');

      for (let attempt = 1; attempt <= maxFailures; attempt++) {
        const expectedStatus = attempt === maxFailures ? 429 : 401;

        await request(server)
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
      await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(429);
    });

    it('should reject incorrect OTP submissions and never issue registration authority', async () => {
      const phone = newPhone();
      const deviceId = newDeviceId();

      const challenge = await issueTestOtp(phone, deviceId);
      const wrongOtp = challenge.otp === '123456' ? '654321' : '123456';

      const failedVerification = await request(server)
        .post('/api/v1/auth/verify-otp')
        .send({
          phone,
          deviceId,
          challengeId: challenge.challengeId,
          otp: wrongOtp,
        })
        .expect(400);

      const failedBody =
        failedVerification.body as unknown as VerifyOtpHttpDto &
          ErrorEnvelopeHttpDto;
      expect(failedBody.message).toBe('Invalid OTP');
      expect(failedBody.registrationAuthorization).toBeUndefined();

      // Ensure no registration can be completed with a forged token
      const failedRegistration = await request(server)
        .post('/api/v1/auth/register')
        .send({
          phone,
          deviceId,
          pin: '1234',
          registrationToken: randomUUID().repeat(2),
        })
        .expect(401);

      const failedRegBody =
        failedRegistration.body as unknown as ErrorEnvelopeHttpDto;
      expect(failedRegBody.code).toBe('REGISTRATION_AUTHORIZATION_INVALID');

      const userCount = await prisma.user.count({ where: { phone } });
      expect(userCount).toBe(0);
    });

    it('should reject expired OTP submissions even when the submitted code is mathematically correct', async () => {
      const phone = newPhone();
      const deviceId = newDeviceId();

      // 1. Issue a fresh test OTP challenge
      const challenge = await issueTestOtp(phone, deviceId);
      const challengeKey = `auth:otp:{${phone}}:challenge:${challenge.challengeId}`;

      // 2. Shorten the challenge key's TTL in Redis so it expires
      await redis.evalScript(
        'return redis.call("PEXPIRE", KEYS[1], ARGV[1])',
        [challengeKey],
        ['50'],
      );

      // Wait for the key to expire in Redis
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(await redis.get(challengeKey)).toBeNull();

      // 3. Submit the previously valid OTP through the actual /verify-otp endpoint
      const expiredAttempt = await request(server)
        .post('/api/v1/auth/verify-otp')
        .send({
          phone,
          deviceId,
          challengeId: challenge.challengeId,
          otp: challenge.otp,
        })
        .expect(400);

      const expiredBody = expiredAttempt.body as unknown as VerifyOtpHttpDto &
        ErrorEnvelopeHttpDto;
      expect(expiredBody.message).toBe(
        'OTP challenge is expired or superseded',
      );
      expect(expiredBody.registrationAuthorization).toBeUndefined();

      // 4. Ensure no registration authority was issued or can be used
      const failedRegistration = await request(server)
        .post('/api/v1/auth/register')
        .send({
          phone,
          deviceId,
          pin: '1234',
          registrationToken: randomUUID().repeat(2),
        })
        .expect(401);

      const failedRegBody =
        failedRegistration.body as unknown as ErrorEnvelopeHttpDto;
      expect(failedRegBody.code).toBe('REGISTRATION_AUTHORIZATION_INVALID');

      expect(await prisma.user.count({ where: { phone } })).toBe(0);
    });

    it('should prevent utilizing a valid registration authorization proof on a different physical device', async () => {
      const phone = newPhone();
      const deviceA = newDeviceId();
      const deviceB = newDeviceId();

      const challenge = await issueTestOtp(phone, deviceA);

      const verified = await request(server)
        .post('/api/v1/auth/verify-otp')
        .send({
          phone,
          deviceId: deviceA,
          challengeId: challenge.challengeId,
          otp: challenge.otp,
        })
        .expect(200);

      const verifiedBody = verified.body as unknown as VerifyOtpHttpDto;
      const registrationToken = verifiedBody.registrationAuthorization
        ?.token as string;
      expect(registrationToken).toEqual(expect.any(String) as unknown);

      // Attacker deviceB attempts to consume deviceA's registration token
      const stolenAttempt = await request(server)
        .post('/api/v1/auth/register')
        .send({
          phone,
          deviceId: deviceB,
          pin: '1234',
          registrationToken,
        })
        .expect(401);

      const stolenBody = stolenAttempt.body as unknown as ErrorEnvelopeHttpDto;
      expect(stolenBody.code).toBe('REGISTRATION_AUTHORIZATION_INVALID');

      // User is not created in the database
      expect(await prisma.user.count({ where: { phone } })).toBe(0);

      // Legitimate deviceA can still register using its proof
      const legitRegistration = await request(server)
        .post('/api/v1/auth/register')
        .send({
          phone,
          deviceId: deviceA,
          pin: '1234',
          registrationToken,
        })
        .expect(201);

      const legitBody = legitRegistration.body as unknown as AuthTokenHttpDto;
      expect(legitBody.accessToken).toEqual(expect.any(String) as unknown);

      const user = await prisma.user.findUniqueOrThrow({
        where: { phone },
        include: { wallet: true },
      });
      ownedUserIds.push(user.id);
    });

    it('should prevent authorizing a new device using SMS OTP alone without a PIN-derived enrollment token', async () => {
      const user = await registerUserThroughHttp();

      // Clear resend cooldown for user.phone
      await redis.del(`auth:otp:{${user.phone}}:resend`);

      const attackerDeviceId = newDeviceId();

      // Attacker requests an OTP to the victim's phone
      const challenge = await issueTestOtp(user.phone, attackerDeviceId);

      // Attacker intercepts SMS OTP and attempts verify-otp without deviceEnrollmentToken
      const attempt = await request(server)
        .post('/api/v1/auth/verify-otp')
        .send({
          phone: user.phone,
          deviceId: attackerDeviceId,
          challengeId: challenge.challengeId,
          otp: challenge.otp,
        })
        .expect(403);

      const attemptBody = attempt.body as unknown as ErrorEnvelopeHttpDto;
      expect(attemptBody.code).toBe('DEVICE_ENROLLMENT_AUTHORIZATION_REQUIRED');

      // Ensure attackerDeviceId was NOT added or authorized in trustDevice
      const deviceRecord = await prisma.trustDevice.findUnique({
        where: {
          userId_deviceId: {
            userId: user.userId,
            deviceId: attackerDeviceId,
          },
        },
      });
      expect(deviceRecord).toBeNull();

      // Attacker cannot login without completing device verification flow
      const loginAttempt = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: attackerDeviceId,
        })
        .expect(403);

      const loginAttemptBody =
        loginAttempt.body as unknown as ErrorEnvelopeHttpDto;
      expect(loginAttemptBody.code).toBe('DEVICE_VERIFICATION_REQUIRED');
    });
  });

  describe('Logout Idempotency & Session Race Protections', () => {
    it('should handle logout with missing, malformed, or expired cookies as an idempotent 204 No Content with cookie clearance', async () => {
      // 1. Missing cookie header
      const missingCookieResponse = await request(server)
        .post('/api/v1/auth/logout')
        .expect(204);

      const missingCookieHeaders = missingCookieResponse.headers[
        'set-cookie'
      ] as unknown as string[] | undefined;
      expect(
        missingCookieHeaders?.some(
          (header) =>
            header.startsWith('refresh_token=') &&
            header.includes('Path=/api/v1/auth'),
        ),
      ).toBe(true);

      // 2. Properly signed expired JWT cookie
      const refreshSecret = configService.getOrThrow<string>(
        'REFRESH_TOKEN_SECRET',
      );
      const expiredToken = jwtService.sign(
        {
          sub: '00000000-0000-0000-0000-000000000000',
          role: 'CUSTOMER',
          deviceId: 'device-expired-test',
          sid: randomUUID(),
          jti: randomUUID(),
          tokenUse: 'refresh',
        },
        {
          secret: refreshSecret,
          expiresIn: '-10s',
          algorithm: 'HS256',
        },
      );

      const expiredCookieResponse = await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', `refresh_token=${expiredToken}`)
        .expect(204);

      const expiredCookieHeaders = expiredCookieResponse.headers[
        'set-cookie'
      ] as unknown as string[] | undefined;
      expect(
        expiredCookieHeaders?.some(
          (header) =>
            header.startsWith('refresh_token=') &&
            header.includes('Path=/api/v1/auth'),
        ),
      ).toBe(true);

      // 3. Malformed cookie header
      const malformedCookieResponse = await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', 'refresh_token=malformed.invalid.jwt.token')
        .expect(204);

      const malformedCookieHeaders = malformedCookieResponse.headers[
        'set-cookie'
      ] as unknown as string[] | undefined;
      expect(
        malformedCookieHeaders?.some(
          (header) =>
            header.startsWith('refresh_token=') &&
            header.includes('Path=/api/v1/auth'),
        ),
      ).toBe(true);

      // 4. Repeated logout on an authenticated user is completely safe and idempotent
      const user = await registerUserThroughHttp();
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);

      const validCookie = refreshCookieFrom(login);

      await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', validCookie)
        .expect(204);

      await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', validCookie)
        .expect(204);
    });

    it('should prevent delayed logout requests from an older session from invalidating newer active database sessions', async () => {
      const user = await registerUserThroughHttp();

      // Session 1 login on trusted device
      const loginS1 = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);

      const cookieS1 = refreshCookieFrom(loginS1);

      // Session 2 login on same trusted device supersedes S1 in database
      const loginS2 = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);

      const cookieS2 = refreshCookieFrom(loginS2);

      const deviceStateBeforeDelayedLogout =
        await prisma.trustDevice.findUniqueOrThrow({
          where: {
            userId_deviceId: { userId: user.userId, deviceId: user.deviceId },
          },
        });

      const activeSessionId = deviceStateBeforeDelayedLogout.refreshSessionId;
      const activeJti = deviceStateBeforeDelayedLogout.currentRefreshJti;
      expect(activeSessionId).toBeTruthy();
      expect(activeJti).toBeTruthy();

      // Delayed logout with cookie from Session 1
      await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookieS1)
        .expect(204);

      // Verify Session 2 in database was not revoked or modified
      const deviceStateAfterDelayedLogout =
        await prisma.trustDevice.findUniqueOrThrow({
          where: {
            userId_deviceId: { userId: user.userId, deviceId: user.deviceId },
          },
        });

      expect(deviceStateAfterDelayedLogout.refreshSessionId).toBe(
        activeSessionId,
      );
      expect(deviceStateAfterDelayedLogout.currentRefreshJti).toBe(activeJti);

      // Session 2 can still refresh successfully
      const refreshedS2 = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieS2)
        .expect(200);

      const refreshedS2Body = refreshedS2.body as unknown as AuthTokenHttpDto;
      expect(refreshedS2Body.accessToken).toEqual(
        expect.any(String) as unknown,
      );

      // Session 1 is completely rejected
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieS1)
        .expect(401);
    });

    it('should guarantee that completed device revocation leaves no renewable session under concurrent refresh attempts', async () => {
      const user = await registerUserThroughHttp();

      const device = await prisma.trustDevice.findUniqueOrThrow({
        where: {
          userId_deviceId: { userId: user.userId, deviceId: user.deviceId },
        },
      });

      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(200);

      const activeCookie = refreshCookieFrom(login);

      // Concurrently trigger device revocation and token refresh
      const [revokeResult, refreshResult] = await Promise.allSettled([
        request(server)
          .delete(`/api/v1/auth/devices/${device.id}`)
          .set('Authorization', `Bearer ${user.accessToken}`),
        request(server)
          .post('/api/v1/auth/refresh')
          .set('Cookie', activeCookie),
      ]);

      expect(revokeResult.status).toBe('fulfilled');
      if (revokeResult.status === 'fulfilled') {
        expect(revokeResult.value.status).toBe(204);
      }

      // Database state must be un-authorized with all session identifiers wiped
      const postRevocationDevice = await prisma.trustDevice.findUniqueOrThrow({
        where: { id: device.id },
      });

      expect(postRevocationDevice.isAuthorized).toBe(false);
      expect(postRevocationDevice.refreshSessionId).toBeNull();
      expect(postRevocationDevice.currentRefreshJti).toBeNull();

      // Whichever refresh cookie was held or rotated can no longer renew
      let cookieToTest = activeCookie;
      if (
        refreshResult.status === 'fulfilled' &&
        refreshResult.value.status === 200
      ) {
        cookieToTest = refreshCookieFrom(refreshResult.value);
      }

      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieToTest)
        .expect(401);

      // Initial cookie is also rejected
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', activeCookie)
        .expect(401);

      // PIN login alone is rejected because device is no longer trusted
      const loginAttempt = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: user.phone,
          pin: user.pin,
          deviceId: user.deviceId,
        })
        .expect(403);

      const loginAttemptBody =
        loginAttempt.body as unknown as ErrorEnvelopeHttpDto;
      expect(loginAttemptBody.code).toBe('DEVICE_VERIFICATION_REQUIRED');
    });
  });
});
