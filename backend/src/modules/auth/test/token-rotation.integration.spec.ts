import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { WalletsService } from '../../wallets/wallets.service';
import { PasswordService } from '../services/password.service';
import { AuthProofService } from '../services/auth-proof.service';
import { Role } from 'src/domain/enums';
import { AccountStatus } from 'generated/prisma/client';
import { RefreshTokenPayload } from '../interfaces/jwt.interface';

interface UserRecord {
  id: string;
  role: Role;
  status: AccountStatus;
}

interface TrustDeviceRecord {
  isAuthorized: boolean;
  refreshSessionId: string | null;
  currentRefreshJti: string | null;
}

interface UpdateManyResult {
  count: number;
}

interface UpdateManyCallPayload {
  where: unknown;
  data: {
    currentRefreshJti: string;
    lastUsedAt: Date;
  };
}

describe('[Integration] Token Rotation and Session Isolation', () => {
  let authService: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn<Promise<UserRecord | null>, [unknown]>(),
    },
    trustDevice: {
      updateMany: jest.fn<Promise<UpdateManyResult>, [unknown]>(),
      findUnique: jest.fn<Promise<TrustDeviceRecord | null>, [unknown]>(),
    },
  };

  const jwtServiceMock = {
    signAsync: jest.fn<Promise<string>, [unknown, unknown?]>(),
  };

  const configServiceMock = {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        ACCESS_TOKEN_SECRET: 'test-access-secret-1234567890',
        ACCESS_TOKEN_EXPIRY: '15m',
        REFRESH_TOKEN_SECRET: 'test-refresh-secret-1234567890',
        REFRESH_TOKEN_EXPIRY: '7d',
      };
      return map[key] ?? 'test-value';
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RedisService, useValue: {} },
        { provide: WalletsService, useValue: {} },
        { provide: PasswordService, useValue: {} },
        { provide: AuthProofService, useValue: {} },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  const basePayload: RefreshTokenPayload = {
    sub: 'user-uuid-1',
    deviceId: 'device-1',
    sid: 'session-sid-1',
    jti: 'token-jti-A',
    tokenUse: 'refresh',
  };

  describe('Normal refresh A → B', () => {
    it('should rotate currentRefreshJti to B and return fresh tokens when refresh payload is valid', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce('access-token-B')
        .mockResolvedValueOnce('refresh-token-B');

      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await authService.refreshTokens(basePayload);

      expect(result).toEqual({
        accessToken: 'access-token-B',
        refreshToken: 'refresh-token-B',
      });

      // Verify rotation query in Prisma
      expect(prismaMock.trustDevice.updateMany).toHaveBeenCalledWith({
        where: {
          userId: basePayload.sub,
          deviceId: basePayload.deviceId,
          refreshSessionId: basePayload.sid,
          currentRefreshJti: basePayload.jti,
          isAuthorized: true,
          user: {
            is: {
              status: AccountStatus.ACTIVE,
            },
          },
        },
        data: {
          currentRefreshJti: expect.any(String) as unknown as string,
          lastUsedAt: expect.any(Date) as unknown as Date,
        },
      });

      const rawCalls = prismaMock.trustDevice.updateMany.mock
        .calls as unknown as unknown[][];
      const updateCall = rawCalls[0][0] as UpdateManyCallPayload;
      const updatedJti = updateCall.data.currentRefreshJti;
      expect(updatedJti).not.toEqual(basePayload.jti);

      // Verify tokens were signed with new JTI but preserved SID
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: basePayload.sub,
          deviceId: basePayload.deviceId,
          sid: basePayload.sid,
          jti: updatedJti,
        }),
        expect.any(Object) as unknown as object,
      );
    });
  });

  describe('Reuse A after rotation (Replay Attack Detection)', () => {
    it('should detect replay of old JTI, revoke the session, and throw UnauthorizedException', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce('access-token-B')
        .mockResolvedValueOnce('refresh-token-B');

      // 1. Rotation fails because currentRefreshJti is no longer jti-A (already rotated to jti-B)
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 0 });

      // 2. Query finds that session is still active with sid-1, but currentRefreshJti has moved on
      prismaMock.trustDevice.findUnique.mockResolvedValueOnce({
        isAuthorized: true,
        refreshSessionId: basePayload.sid, // matches sid-1
        currentRefreshJti: 'token-jti-B', // does not match jti-A
      });

      // 3. Replay revocation update
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(authService.refreshTokens(basePayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify the session was revoked (set to null)
      expect(prismaMock.trustDevice.updateMany).toHaveBeenLastCalledWith({
        where: {
          userId: basePayload.sub,
          deviceId: basePayload.deviceId,
          refreshSessionId: basePayload.sid,
          isAuthorized: true,
          AND: [
            { currentRefreshJti: { not: null } },
            { currentRefreshJti: { not: basePayload.jti } },
          ],
        },
        data: {
          refreshSessionId: null,
          currentRefreshJti: null,
        },
      });
    });
  });

  describe('Old S1 token after new S2 login (Old-Session Isolation)', () => {
    it('should reject old session token with UnauthorizedException while leaving active session intact', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce('access-token-X')
        .mockResolvedValueOnce('refresh-token-X');

      // 1. S1 refresh fails because device is currently on session S2
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 0 });

      // 2. Device lookup reveals current active session is S2
      const activeSessionS2 = 'new-session-sid-2';
      prismaMock.trustDevice.findUnique.mockResolvedValueOnce({
        isAuthorized: true,
        refreshSessionId: activeSessionS2, // does NOT match basePayload.sid (S1)
        currentRefreshJti: 'new-session-jti-2',
      });

      await expect(authService.refreshTokens(basePayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // CRITICAL ASSERTION: The session revocation update was NOT called! S2 remains intact!
      // Only 1 updateMany call (the initial rotation attempt) was made
      expect(prismaMock.trustDevice.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('Revoked device refresh', () => {
    it('should reject with UnauthorizedException and not rotate tokens when device is deauthorized', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      });

      // Rotation matches 0 rows because isAuthorized is false in where clause
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 0 });

      // Device lookup shows isAuthorized is false
      prismaMock.trustDevice.findUnique.mockResolvedValueOnce({
        isAuthorized: false,
        refreshSessionId: basePayload.sid,
        currentRefreshJti: basePayload.jti,
      });

      await expect(authService.refreshTokens(basePayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // Replay wipe was NOT called because device was not authorized
      expect(prismaMock.trustDevice.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('User suspended before refresh', () => {
    it('should throw UnauthorizedException immediately when user status is SUSPENDED without querying trustDevice', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.CUSTOMER,
        status: AccountStatus.SUSPENDED,
      });

      await expect(authService.refreshTokens(basePayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // trustDevice queries are never touched
      expect(prismaMock.trustDevice.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.trustDevice.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('Account role changes before refresh', () => {
    it('should issue new access token reflecting updated role from database when role changes before refresh', async () => {
      // User was promoted from CUSTOMER to AGENT in DB
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.AGENT,
        status: AccountStatus.ACTIVE,
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce('access-token-AGENT')
        .mockResolvedValueOnce('refresh-token-new');

      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 1 });

      const tokens = await authService.refreshTokens(basePayload);

      expect(tokens.accessToken).toBe('access-token-AGENT');

      // Verify signAsync for access token was called with user.role = AGENT
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: basePayload.sub,
          role: Role.AGENT,
        }),
        expect.any(Object) as unknown as object,
      );
    });
  });

  describe('Failed CAS without JTI advancement', () => {
    it('should reject with UnauthorizedException without triggering replay revocation when stored JTI has not advanced', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: basePayload.sub,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce('access-token-new')
        .mockResolvedValueOnce('refresh-token-new');

      // 1. Initial CAS update fails (count = 0)
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 0 });

      // 2. Database lookup shows currentRefreshJti has NOT moved (still basePayload.jti)
      prismaMock.trustDevice.findUnique.mockResolvedValueOnce({
        isAuthorized: true,
        refreshSessionId: basePayload.sid,
        currentRefreshJti: basePayload.jti,
      });

      // 3. Act & Assert: Throws 401
      await expect(authService.refreshTokens(basePayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // 4. Assert: updateMany was called ONLY ONCE (the initial CAS), NOT for revocation
      expect(prismaMock.trustDevice.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
