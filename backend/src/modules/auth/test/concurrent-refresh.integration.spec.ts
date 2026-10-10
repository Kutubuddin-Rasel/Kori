import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AppModule } from 'src/app.module';
import { Role } from 'src/domain/enums';
import { AccountStatus } from 'generated/prisma/client';
import { RefreshTokenPayload } from '../interfaces/jwt.interface';
import { randomUUID } from 'crypto';

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

  it('at most one rotation succeeds; strict replay revokes resulting session in PostgreSQL', async () => {
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

    // CRITICAL ATOMICITY GUARANTEE:
    // Under PostgreSQL row-level locks, it is IMPOSSIBLE for both concurrent rotations to succeed
    expect(fulfilledResults.length).toBeLessThanOrEqual(1);

    // At least one request MUST be rejected
    expect(rejectedResults.length).toBeGreaterThanOrEqual(1);

    for (const rejected of rejectedResults) {
      const error = (rejected as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(UnauthorizedException);
    }

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
  });
});
