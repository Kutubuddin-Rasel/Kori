import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '../src/domain/enums';
import { AccountStatus } from '../generated/prisma/client';

describe('Auth Cookie & Refresh Flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let jwtService: JwtService;
  let configService: ConfigService;

  let testUserId: string;
  const testPhone = '+8801888777666';
  const testPin = '1234';
  const testDeviceId = 'e2e-cookie-test-device';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    passwordService = app.get<PasswordService>(PasswordService);
    jwtService = app.get<JwtService>(JwtService);
    configService = app.get<ConfigService>(ConfigService);

    // Cleanup existing test user if present
    await prisma.trustDevice.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    // Seed test user with hashed PIN and pre-authorized device
    const hashedPin = await passwordService.hash(testPin);
    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        pin: hashedPin,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      },
    });
    testUserId = user.id;

    await prisma.trustDevice.create({
      data: {
        userId: testUserId,
        deviceId: testDeviceId,
        isAuthorized: true,
      },
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.trustDevice.deleteMany({ where: { userId: testUserId } });
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    await app.close();
  });

  let validRefreshCookie: string;

  it('issues refresh cookie with correct attributes and /api/v1/auth path upon login', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        phone: testPhone,
        pin: testPin,
        deviceId: testDeviceId,
      })
      .expect(200);

    expect(response.body).toHaveProperty('accessToken');

    const cookies = response.headers['set-cookie'] as unknown as
      | string[]
      | undefined;
    expect(cookies).toBeDefined();
    expect(Array.isArray(cookies)).toBe(true);

    const refreshCookieHeader = cookies?.find((c) =>
      c.startsWith('refresh_token='),
    );
    expect(refreshCookieHeader).toBeDefined();

    // Verify Cookie Attributes: Path, HttpOnly, SameSite
    expect(refreshCookieHeader).toContain('Path=/api/v1/auth');
    expect(refreshCookieHeader).toContain('HttpOnly');
    expect(refreshCookieHeader).toMatch(/SameSite=(Lax|Strict)/i);

    // Extract raw cookie key-value for subsequent tests (e.g., "refresh_token=xyz...")
    const match = refreshCookieHeader?.match(/^refresh_token=[^;]+/);
    validRefreshCookie = match ? match[0] : '';
    expect(validRefreshCookie).toBeTruthy();
  });

  it('successfully rotates token via browser-style cookie parser on refresh', async () => {
    expect(validRefreshCookie).toBeTruthy();

    // Query pre-refresh state in DB
    const preDevice = await prisma.trustDevice.findUnique({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });
    const preJti = preDevice?.currentRefreshJti;
    expect(preJti).toBeTruthy();

    // Call /api/v1/auth/refresh using Cookie header (browser style, no Bearer token)
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', validRefreshCookie)
      .expect(200);

    expect(response.body).toHaveProperty('accessToken');

    // Verify fresh rotated cookie in response
    const cookies = response.headers['set-cookie'] as unknown as
      | string[]
      | undefined;
    expect(cookies).toBeDefined();
    const newRefreshCookieHeader = cookies?.find((c) =>
      c.startsWith('refresh_token='),
    );
    expect(newRefreshCookieHeader).toBeDefined();
    expect(newRefreshCookieHeader).toContain('Path=/api/v1/auth');

    // Verify DB updated currentRefreshJti
    const postDevice = await prisma.trustDevice.findUnique({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });
    expect(postDevice?.currentRefreshJti).not.toBe(preJti);
    expect(postDevice?.refreshSessionId).toBe(preDevice?.refreshSessionId);
  });

  it('rejects forged or expired JWT with 401 without mutating database session', async () => {
    // 1. Snapshot database session state before forged attempt
    const deviceBefore = await prisma.trustDevice.findUnique({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });
    const expectedJti = deviceBefore?.currentRefreshJti;
    const expectedSid = deviceBefore?.refreshSessionId;

    // 2. Case A: Forged token (signed with random foreign secret)
    const forgedToken = await jwtService.signAsync(
      {
        sub: testUserId,
        deviceId: testDeviceId,
        sid: expectedSid,
        jti: expectedJti,
        tokenUse: 'refresh',
      },
      {
        secret: 'completely-wrong-forged-secret-key-1234567890',
        expiresIn: '7d',
        algorithm: 'HS256',
      },
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${forgedToken}`)
      .expect(401);

    // 3. Case B: Expired token (signed with valid secret, but expired)
    const expiredToken = await jwtService.signAsync(
      {
        sub: testUserId,
        deviceId: testDeviceId,
        sid: expectedSid,
        jti: expectedJti,
        tokenUse: 'refresh',
      },
      {
        secret: configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: '0s', // expired immediately
        algorithm: 'HS256',
      },
    );

    // Allow 100ms for expiration to take effect
    await new Promise((r) => setTimeout(r, 100));

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${expiredToken}`)
      .expect(401);

    // 4. Verify database state is completely unmutated
    const deviceAfter = await prisma.trustDevice.findUnique({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });

    expect(deviceAfter?.currentRefreshJti).toBe(expectedJti);
    expect(deviceAfter?.refreshSessionId).toBe(expectedSid);
    expect(deviceAfter?.isAuthorized).toBe(true);
  });
});
