import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AppModule } from 'src/app.module';
import { Role } from 'src/domain/enums';
import { AccountStatus } from 'generated/prisma/client';
import { RefreshTokenPayload } from '../interfaces/jwt.interface';
import { randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

describe('[Integration Real PostgreSQL] Two concurrent refreshes of token A', () => {
  let moduleRef: TestingModule;
  let authService: AuthService;
  let prisma: PrismaService;

  let testUserId: string;
  const testPhone = '+8801999888777';
  const testDeviceId = 'concurrent-test-device-uuid';

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Clean up any potential lingering test records
    await prisma.trustDevice.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    // Seed test user
    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        pin: 'hash-for-concurrency-test',
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.trustDevice.deleteMany({ where: { userId: testUserId } });
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    await moduleRef.close();
  });

  it('should ensure at most one rotation succeeds and strict replay revokes resulting session in PostgreSQL when two refreshes race', async () => {
    const initialSid = randomUUID();
    const initialJti = randomUUID();

    // 1. Seed active session in PostgreSQL
    await prisma.trustDevice.deleteMany({ where: { userId: testUserId } });
    await prisma.trustDevice.create({
      data: {
        userId: testUserId,
        deviceId: testDeviceId,
        isAuthorized: true,
        refreshSessionId: initialSid,
        currentRefreshJti: initialJti,
      },
    });

    const payloadA: RefreshTokenPayload = {
      sub: testUserId,
      deviceId: testDeviceId,
      sid: initialSid,
      jti: initialJti,
      tokenUse: 'refresh',
    };

    // 2. Fire two concurrent refresh requests simultaneously with the exact same token A
    const [result1, result2] = await Promise.allSettled([
      authService.refreshTokens(payloadA),
      authService.refreshTokens(payloadA),
    ]);

    const fulfilledResults = [result1, result2].filter(
      (r) => r.status === 'fulfilled',
    );
    const rejectedResults = [result1, result2].filter(
      (r) => r.status === 'rejected',
    );

    // ATOMICITY GUARANTEE:
    expect(fulfilledResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);

    // Check resulting database state
    const deviceState = await prisma.trustDevice.findUnique({
      where: {
        userId_deviceId: {
          userId: testUserId,
          deviceId: testDeviceId,
        },
      },
    });

    // In a strict replay race:
    // If request 1 succeeded, but request 2 arrived while currentRefreshJti was updated,
    // request 2 detects replay (old JTI A reuse) and revokes the session (sets to null).
    // Or if request 1 succeeded and request 2 completed, either currentRefreshJti was updated or revoked.
    // In NO case does currentRefreshJti remain initialJti!
    expect(deviceState?.currentRefreshJti).not.toBe(initialJti);
    expect(deviceState?.refreshSessionId).toBeNull();
    expect(deviceState?.currentRefreshJti).toBeNull();
  });

  it('should reject old session S1 token without revoking newer active session S2', async () => {
    const sid1 = randomUUID();
    const jti1 = randomUUID();

    const sid2 = randomUUID();
    const jti2 = randomUUID();

    // Establish the first session.
    await prisma.trustDevice.update({
      where: {
        userId_deviceId: {
          userId: testUserId,
          deviceId: testDeviceId,
        },
      },
      data: {
        isAuthorized: true,
        refreshSessionId: sid1,
        currentRefreshJti: jti1,
      },
    });

    // Simulate the state written by a newer successful login.
    await prisma.trustDevice.update({
      where: {
        userId_deviceId: {
          userId: testUserId,
          deviceId: testDeviceId,
        },
      },
      data: {
        refreshSessionId: sid2,
        currentRefreshJti: jti2,
      },
    });

    const oldPayload: RefreshTokenPayload = {
      sub: testUserId,
      deviceId: testDeviceId,
      sid: sid1,
      jti: jti1,
      tokenUse: 'refresh',
    };

    await expect(authService.refreshTokens(oldPayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // Old S1 must not destroy new S2.
    const device = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: {
          userId: testUserId,
          deviceId: testDeviceId,
        },
      },
    });

    expect(device.refreshSessionId).toBe(sid2);
    expect(device.currentRefreshJti).toBe(jti2);

    // The current session must remain renewable.
    const currentPayload: RefreshTokenPayload = {
      sub: testUserId,
      deviceId: testDeviceId,
      sid: sid2,
      jti: jti2,
      tokenUse: 'refresh',
    };

    const refreshed = await authService.refreshTokens(currentPayload);
    expect(typeof refreshed.accessToken).toBe('string');
    expect(refreshed.accessToken.length).toBeGreaterThan(0);
    expect(typeof refreshed.refreshToken).toBe('string');
    expect(refreshed.refreshToken.length).toBeGreaterThan(0);
  });

  it('should not revoke newer session S2 when logout is called with old session S1 credentials', async () => {
    const sid1 = randomUUID();
    const jti1 = randomUUID();

    const sid2 = randomUUID();
    const jti2 = randomUUID();

    // 1. Seed active session in PostgreSQL
    await prisma.trustDevice.deleteMany({ where: { userId: testUserId } });
    await prisma.trustDevice.create({
      data: {
        userId: testUserId,
        deviceId: testDeviceId,
        isAuthorized: true,
        refreshSessionId: sid1,
        currentRefreshJti: jti1,
      },
    });

    await prisma.trustDevice.update({
      where: {
        userId_deviceId: {
          userId: testUserId,
          deviceId: testDeviceId,
        },
      },
      data: {
        refreshSessionId: sid2,
        currentRefreshJti: jti2,
        isAuthorized: true,
      },
    });

    await authService.logoutCurrentSession({
      sub: testUserId,
      deviceId: testDeviceId,
      sid: sid1,
      jti: jti1,
      tokenUse: 'refresh',
    });

    const device = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: {
          userId: testUserId,
          deviceId: testDeviceId,
        },
      },
    });

    expect(device.refreshSessionId).toBe(sid2);
    expect(device.currentRefreshJti).toBe(jti2);
  });

  it('should terminate only the matching session family when logout is executed across multiple devices', async () => {
    const sid1 = randomUUID();
    const jti1 = randomUUID();

    const sid2 = randomUUID();
    const jti2 = randomUUID();
    const testDeviceId2 = 'second-test-device-uuid';

    await prisma.trustDevice.deleteMany({ where: { userId: testUserId } });
    await prisma.trustDevice.create({
      data: {
        userId: testUserId,
        deviceId: testDeviceId,
        isAuthorized: true,
        refreshSessionId: sid1,
        currentRefreshJti: jti1,
      },
    });

    await prisma.trustDevice.create({
      data: {
        userId: testUserId,
        deviceId: testDeviceId2,
        isAuthorized: true,
        refreshSessionId: sid2,
        currentRefreshJti: jti2,
      },
    });

    await authService.logoutCurrentSession({
      sub: testUserId,
      deviceId: testDeviceId,
      sid: sid1,
      jti: jti2,
      tokenUse: 'refresh',
    });

    const deviceA = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });

    const deviceB = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId2 },
      },
    });

    expect(deviceA.refreshSessionId).toBe(null);
    expect(deviceA.currentRefreshJti).toBe(null);
    expect(deviceA.isAuthorized).toBe(true);

    expect(deviceB.refreshSessionId).toBe(sid2);
    expect(deviceB.currentRefreshJti).toBe(jti2);
    expect(deviceB.isAuthorized).toBe(true);
  });

  it('should handle repeat logout idempotently without throwing errors', async () => {
    const sid = randomUUID();
    const jti = randomUUID();

    await prisma.trustDevice.deleteMany({ where: { userId: testUserId } });
    await prisma.trustDevice.create({
      data: {
        userId: testUserId,
        deviceId: testDeviceId,
        refreshSessionId: sid,
        currentRefreshJti: jti,
        isAuthorized: true,
      },
    });

    await authService.logoutCurrentSession({
      sub: testUserId,
      deviceId: testDeviceId,
      sid,
      jti,
      tokenUse: 'refresh',
    });

    const resultA = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });

    expect(resultA.refreshSessionId).toBe(null);
    expect(resultA.currentRefreshJti).toBe(null);

    await authService.logoutCurrentSession({
      sub: testUserId,
      deviceId: testDeviceId,
      sid,
      jti,
      tokenUse: 'refresh',
    });

    const resultB = await prisma.trustDevice.findUniqueOrThrow({
      where: {
        userId_deviceId: { userId: testUserId, deviceId: testDeviceId },
      },
    });

    expect(resultB.refreshSessionId).toBe(null);
    expect(resultB.currentRefreshJti).toBe(null);
  });
});
