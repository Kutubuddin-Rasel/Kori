import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AccountsController } from '../accounts.controller';
import { AccountRestrictionService } from '../account-restriction.service';
import { ActiveAccountGuard } from '../../auth/guards/active-account.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtStrategy } from '../../auth/strategies/jwt-strategy';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { Role, AccountStatus } from 'src/domain/enums';
import { AccountStatus as PrismaAccountStatus } from 'generated/prisma/enums';

interface MockPrismaUser {
  id: string;
  role: Role;
  status: PrismaAccountStatus;
}

interface AccountRestrictionHttpResponse {
  userId: string;
  status: AccountStatus;
}

interface ErrorHttpResponse {
  code?: string;
  message?: string | string[];
  statusCode?: number;
}

type SupertestTarget = Parameters<typeof request>[0];

describe('AccountsController — Administrative Account Restriction Endpoints', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let server: SupertestTarget;

  const testSecret = 'test-jwt-access-secret-for-accounts-controller-12345';
  const adminUserId = '99999999-9999-4999-8999-999999999999';
  const customerUserId = '11111111-1111-4111-8111-111111111111';
  const targetUserId = '22222222-2222-4222-8222-222222222222';

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const accountRestrictionServiceMock = {
    suspend: jest.fn(),
    reactivate: jest.fn(),
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
      controllers: [AccountsController],
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
          provide: AccountRestrictionService,
          useValue: accountRestrictionServiceMock,
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

  describe('PATCH /admin/accounts/:userId/suspend', () => {
    it('should allow an administrator to suspend a customer account and return 200 OK', async () => {
      const adminToken = await jwtService.signAsync({
        sub: adminUserId,
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        role: Role.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      accountRestrictionServiceMock.suspend.mockResolvedValueOnce({
        userId: targetUserId,
        status: AccountStatus.SUSPENDED,
      });

      const response = await request(server)
        .patch(`/admin/accounts/${targetUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as AccountRestrictionHttpResponse;
      expect(body).toEqual({
        userId: targetUserId,
        status: AccountStatus.SUSPENDED,
      });
    });

    it('should reject non-admin callers with 403 Forbidden via RolesGuard', async () => {
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
        .patch(`/admin/accounts/${targetUserId}/suspend`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      const body = response.body as unknown as ErrorHttpResponse;
      expect(body.message).toContain('Access denied');
    });

    it('should reject malformed non-UUID identifiers with 400 Bad Request via ParseUUIDPipe', async () => {
      const adminToken = await jwtService.signAsync({
        sub: adminUserId,
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        role: Role.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      await request(server)
        .patch('/admin/accounts/invalid-uuid-123/suspend')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('PATCH /admin/accounts/:userId/reactivate', () => {
    it('should allow an administrator to reactivate a suspended customer account and return 200 OK', async () => {
      const adminToken = await jwtService.signAsync({
        sub: adminUserId,
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        role: Role.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      accountRestrictionServiceMock.reactivate.mockResolvedValueOnce({
        userId: targetUserId,
        status: AccountStatus.ACTIVE,
      });

      const response = await request(server)
        .patch(`/admin/accounts/${targetUserId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as AccountRestrictionHttpResponse;
      expect(body).toEqual({
        userId: targetUserId,
        status: AccountStatus.ACTIVE,
      });
    });
  });
});
