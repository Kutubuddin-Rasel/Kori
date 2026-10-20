import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { WalletsController } from '../wallets.controller';
import { WalletsService } from '../wallets.service';
import { ActiveAccountGuard } from '../../auth/guards/active-account.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtStrategy } from '../../auth/strategies/jwt-strategy';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { BigIntInterceptor } from 'src/common/interceptors/bigInt.interceptor';
import { Role, WalletType } from 'src/domain/enums';
import { AccountStatus as PrismaAccountStatus } from 'generated/prisma/enums';
import { ConflictException } from '@nestjs/common';

interface MockPrismaUser {
  id: string;
  role: Role;
  status: PrismaAccountStatus;
}

interface WalletBalanceHttpResponse {
  id: string;
  balance: string;
  type: string;
  currency: string;
  isActive: boolean;
}

interface WalletOwnerHttpResponse {
  id: string;
  balance: string;
  type: string;
  currency: string;
  isActive: boolean;
  userId?: string;
  createdAT?: string;
}

interface ErrorHttpResponse {
  code?: string;
  message?: string | string[];
  statusCode?: number;
}

type SupertestTarget = Parameters<typeof request>[0];

describe('WalletsController — HTTP Routing, Serialization, and Security Guards', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let server: SupertestTarget;

  const testSecret = 'test-jwt-access-secret-for-wallets-controller-12345';
  const customerUserId = '11111111-1111-4111-8111-111111111111';
  const adminUserId = '99999999-9999-4999-8999-999999999999';
  const targetWalletId = '22222222-2222-4222-8222-222222222222';

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const walletsServiceMock = {
    getMyBalance: jest.fn(),
    getWalletById: jest.fn(),
    activeWallet: jest.fn(),
    deactiveWallet: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: testSecret,
          signOptions: { algorithm: 'HS256', expiresIn: '15m' },
        }),
      ],
      controllers: [WalletsController],
      providers: [
        JwtStrategy,
        ActiveAccountGuard,
        RolesGuard,
        Reflector,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string): string => {
              if (key === 'ACCESS_TOKEN_SECRET') return testSecret;
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: WalletsService,
          useValue: walletsServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();

    server = app.getHttpServer() as unknown as SupertestTarget;
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /wallets/my-balance', () => {
    it('should return 200 OK with BigInt balance serialized as a string when an active user queries a frozen wallet', async () => {
      const token = await jwtService.signAsync({
        sub: customerUserId,
        role: Role.CUSTOMER,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: customerUserId,
        role: Role.CUSTOMER,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      walletsServiceMock.getMyBalance.mockResolvedValueOnce({
        id: targetWalletId,
        balance: 500000n,
        type: WalletType.PERSONAL,
        currency: 'BDT',
        isActive: false,
      });

      const response = await request(server)
        .get('/wallets/my-balance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as unknown as WalletBalanceHttpResponse;
      // Verify BigIntInterceptor serialized balance as a string
      expect(body).toEqual({
        id: targetWalletId,
        balance: '500000',
        type: WalletType.PERSONAL,
        currency: 'BDT',
        isActive: false,
      });
      expect(typeof body.balance).toBe('string');
    });
  });

  describe('PATCH /wallets/:walletId/deactivate', () => {
    it('should permit an administrator to freeze an active wallet and return 200 OK with stringified balance', async () => {
      const adminToken = await jwtService.signAsync({
        sub: adminUserId,
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        role: Role.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      walletsServiceMock.deactiveWallet.mockResolvedValueOnce({
        id: targetWalletId,
        balance: 750000n,
        type: WalletType.PERSONAL,
        currency: 'BDT',
        isActive: false,
        userId: customerUserId,
        createdAT: new Date('2026-01-01T00:00:00.000Z'),
      });

      const response = await request(server)
        .patch(`/wallets/${targetWalletId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as WalletOwnerHttpResponse;
      expect(body.id).toBe(targetWalletId);
      expect(body.isActive).toBe(false);
      expect(body.balance).toBe('750000');
    });

    it('should return 409 Conflict when an administrator attempts to freeze an already frozen wallet', async () => {
      const adminToken = await jwtService.signAsync({
        sub: adminUserId,
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        role: Role.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      walletsServiceMock.deactiveWallet.mockRejectedValueOnce(
        new ConflictException({
          code: 'WALLET_STATE_CHANGED',
          message: 'Wallet is already frozen or its state changed.',
        }),
      );

      const response = await request(server)
        .patch(`/wallets/${targetWalletId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      const body = response.body as unknown as ErrorHttpResponse;
      expect(body.code).toBe('WALLET_STATE_CHANGED');
    });

    it('should deny non-admin users with 403 Forbidden via RolesGuard', async () => {
      const customerToken = await jwtService.signAsync({
        sub: customerUserId,
        role: Role.CUSTOMER,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: customerUserId,
        role: Role.CUSTOMER,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      const response = await request(server)
        .patch(`/wallets/${targetWalletId}/deactivate`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      const body = response.body as unknown as ErrorHttpResponse;
      expect(body.message).toContain('Access denied');
    });
  });

  describe('PATCH /wallets/:walletId/activate', () => {
    it('should permit an administrator to activate a frozen wallet and return 200 OK', async () => {
      const adminToken = await jwtService.signAsync({
        sub: adminUserId,
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        role: Role.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      walletsServiceMock.activeWallet.mockResolvedValueOnce({
        id: targetWalletId,
        balance: 500000n,
        type: WalletType.PERSONAL,
        currency: 'BDT',
        isActive: true,
        userId: customerUserId,
        createdAT: new Date('2026-01-01T00:00:00.000Z'),
      });

      const response = await request(server)
        .patch(`/wallets/${targetWalletId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as WalletOwnerHttpResponse;
      expect(body.id).toBe(targetWalletId);
      expect(body.isActive).toBe(true);
      expect(body.balance).toBe('500000');
    });
  });
});
