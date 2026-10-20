import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { TransactionsController } from '../transactions.controller';
import { TransactionsService } from '../transactions.service';
import { ActiveAccountGuard } from '../../auth/guards/active-account.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtStrategy } from '../../auth/strategies/jwt-strategy';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { Role, TransactionStatus, TransactionType } from 'src/domain/enums';
import { AccountStatus as PrismaAccountStatus } from 'generated/prisma/enums';
import { TransactionResultResponse } from '../interfaces/transaction-response.interface';

interface MockPrismaUser {
  id: string;
  role: Role;
  status: PrismaAccountStatus;
}

interface TransactionHttpResult {
  trxId: string;
  type: string;
  status: string;
  amount: string;
  fee: string;
  createdAt: string;
  newBalance: string;
}

interface ErrorHttpResponse {
  code?: string;
  message?: string | string[];
  statusCode?: number;
}

type SupertestTarget = Parameters<typeof request>[0];

describe('TransactionsController — Role & Active Account Route Guards', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let server: SupertestTarget;

  const testSecret = 'test-jwt-access-secret-for-transactions-controller-12345';
  const customerUserId = '11111111-1111-4111-8111-111111111111';
  const agentUserId = '22222222-2222-4222-8222-222222222222';

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const redisMock = {
    get: jest.fn().mockResolvedValue(null),
    setNx: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    getStrict: jest.fn().mockResolvedValue(null),
  };

  const transactionsServiceMock = {
    sendMoney: jest.fn(),
    cashIn: jest.fn(),
    cashOut: jest.fn(),
    payment: jest.fn(),
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
      controllers: [TransactionsController],
      providers: [
        JwtStrategy,
        ActiveAccountGuard,
        RolesGuard,
        Reflector,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string): string | number => {
              if (key === 'ACCESS_TOKEN_SECRET') return testSecret;
              if (key === 'IDEMPOTENCY_TTL_SECONDS') return 600;
              if (key === 'PROCESSING_TTL_SECONDS') return 180;
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: RedisService,
          useValue: redisMock,
        },
        {
          provide: TransactionsService,
          useValue: transactionsServiceMock,
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
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ActiveAccountGuard validation', () => {
    it('should intercept a suspended customer with 403 Forbidden before reaching financial business logic', async () => {
      const customerToken = await jwtService.signAsync({
        sub: customerUserId,
        role: Role.CUSTOMER,
      });

      // Database indicates account is SUSPENDED
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: customerUserId,
        role: Role.CUSTOMER,
        status: PrismaAccountStatus.SUSPENDED,
      } satisfies MockPrismaUser);

      const response = await request(server)
        .post('/transactions/send')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', '00000000-0000-0000-0000-000000000001')
        .send({
          recipientPhone: '+8801711111111',
          amountMinorUnits: '5000',
          reference: 'Rent',
        })
        .expect(403);

      const body = response.body as unknown as ErrorHttpResponse;
      expect(body.message).toBe(
        'Your account is currently restricted. Please contact support.',
      );
      expect(transactionsServiceMock.sendMoney).not.toHaveBeenCalled();
    });

    it('should intercept a suspended agent attempting Cash In with 403 Forbidden before reaching financial business logic', async () => {
      const agentToken = await jwtService.signAsync({
        sub: agentUserId,
        role: Role.AGENT,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: agentUserId,
        role: Role.AGENT,
        status: PrismaAccountStatus.SUSPENDED,
      } satisfies MockPrismaUser);

      const response = await request(server)
        .post('/transactions/cash-in')
        .set('Authorization', `Bearer ${agentToken}`)
        .set('x-idempotency-key', '00000000-0000-0000-0000-000000000002')
        .send({
          customerPhone: '+8801722222222',
          amountMinorUnits: '10000',
          reference: 'Cash in deposit',
        })
        .expect(403);

      const body = response.body as unknown as ErrorHttpResponse;
      expect(body.message).toBe(
        'Your account is currently restricted. Please contact support.',
      );
      expect(transactionsServiceMock.cashIn).not.toHaveBeenCalled();
    });
  });

  describe('transaction routing and authorization', () => {
    it('should allow an active customer to submit a payment and receive 201 Created', async () => {
      const customerToken = await jwtService.signAsync({
        sub: customerUserId,
        role: Role.CUSTOMER,
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: customerUserId,
        role: Role.CUSTOMER,
        status: PrismaAccountStatus.ACTIVE,
      } satisfies MockPrismaUser);

      redisMock.setNx.mockResolvedValueOnce(true);

      const mockResponse: TransactionResultResponse = {
        trxId: 'TX1234567890',
        type: TransactionType.PAYMENT,
        status: TransactionStatus.COMPLETED,
        amount: '5000',
        fee: '0',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        newBalance: '495000',
      };

      transactionsServiceMock.payment.mockResolvedValueOnce(mockResponse);

      const response = await request(server)
        .post('/transactions/payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', '00000000-0000-0000-0000-000000000003')
        .send({
          merchantPhone: '+8801733333333',
          amountMinorUnits: '5000',
          invoiceNumber: 'INV-1001',
        })
        .expect(201);

      const body = response.body as unknown as TransactionHttpResult;
      expect(body.trxId).toBe('TX1234567890');
      expect(body.amount).toBe('5000');
    });

    it('should reject a customer attempting to access agent-restricted Cash In with 403 Forbidden via RolesGuard', async () => {
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
        .post('/transactions/cash-in')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', '00000000-0000-0000-0000-000000000004')
        .send({
          customerPhone: '+8801722222222',
          amountMinorUnits: '10000',
        })
        .expect(403);

      const body = response.body as unknown as ErrorHttpResponse;
      expect(body.message).toContain('Access denied');
      expect(transactionsServiceMock.cashIn).not.toHaveBeenCalled();
    });
  });
});
