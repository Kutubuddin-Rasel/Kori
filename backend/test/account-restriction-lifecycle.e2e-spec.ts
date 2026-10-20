import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '../src/domain/enums';
import {
  AccountStatus as PrismaAccountStatus,
  Role as PrismaRole,
  WalletType as PrismaWalletType,
} from '../generated/prisma/enums';
import { randomUUID } from 'crypto';

interface WalletBalanceHttpDto {
  id: string;
  balance: string;
  type: string;
  currency: string;
  isActive: boolean;
}

interface WalletOwnerHttpDto {
  id: string;
  balance: string;
  type: string;
  currency: string;
  isActive: boolean;
  userId?: string;
  createdAT?: string;
}

interface ErrorEnvelopeHttpDto {
  success?: boolean;
  statusCode?: number;
  code?: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
}

interface AccountRestrictionHttpDto {
  userId: string;
  status: string;
}

interface AuthTokensHttpDto {
  accessToken: string;
}

interface TransactionResultHttpDto {
  trxId: string;
  type: string;
  status: string;
  amount: string;
  fee: string;
  createdAt: string;
  newBalance: string;
}

type SupertestTarget = Parameters<typeof request>[0];

describe('Account Restriction & Financial Lifecycle (E2E Integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let server: SupertestTarget;

  const adminPhone = '+8801799999999';
  const customerPhone = '+8801711112222';
  const recipientPhone = '+8801733334444';
  const agentPhone = '+8801755556666';
  const merchantPhone = '+8801777778888';
  const lockedPhone = '+8801788889999';

  const defaultPin = '1234';
  const customerDeviceId = 'e2e-customer-device-001';

  let adminUserId: string;
  let customerUserId: string;
  let customerWalletId: string;
  let recipientUserId: string;
  let recipientWalletId: string;
  let agentUserId: string;
  let merchantUserId: string;
  let merchantWalletId: string;
  let lockedUserId: string;
  let systemWalletId: string;

  let initialSid: string;
  let initialJti: string;

  const createdUserIds: string[] = [];

  async function cleanupDatabaseForUsers(filter: {
    ids?: string[];
    phones?: string[];
  }): Promise<void> {
    if (!prisma) return;

    const whereClause = filter.ids
      ? { id: { in: filter.ids } }
      : { phone: { in: filter.phones ?? [] } };

    const users = await prisma.user.findMany({
      where: whereClause,
      include: { wallet: true },
    });
    if (users.length === 0) return;

    const userIds = users.map((u) => u.id);
    const walletIds = users
      .map((u) => u.wallet?.id)
      .filter((id): id is string => Boolean(id));

    await prisma.trustDevice.deleteMany({
      where: { userId: { in: userIds } },
    });

    if (walletIds.length > 0) {
      const transactions = await prisma.transaction.findMany({
        where: {
          OR: [
            { senderWalletId: { in: walletIds } },
            { receiverWalletId: { in: walletIds } },
          ],
        },
        select: { id: true },
      });
      const trxIds = transactions.map((t) => t.id);

      if (trxIds.length > 0) {
        await prisma.ledgerEntry.deleteMany({
          where: {
            OR: [
              { transactionId: { in: trxIds } },
              { walletId: { in: walletIds } },
            ],
          },
        });
        await prisma.transaction.deleteMany({
          where: { id: { in: trxIds } },
        });
      } else {
        await prisma.ledgerEntry.deleteMany({
          where: { walletId: { in: walletIds } },
        });
      }

      await prisma.wallet.deleteMany({
        where: { id: { in: walletIds } },
      });
    }

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    server = app.getHttpServer() as unknown as SupertestTarget;
    prisma = app.get<PrismaService>(PrismaService);
    passwordService = app.get<PasswordService>(PasswordService);
    jwtService = app.get<JwtService>(JwtService);
    configService = app.get<ConfigService>(ConfigService);

    // Clean up test phone records if left over from previous runs
    await cleanupDatabaseForUsers({
      phones: [
        adminPhone,
        customerPhone,
        recipientPhone,
        agentPhone,
        merchantPhone,
        lockedPhone,
      ],
    });

    // Ensure System Wallet exists
    const systemWallet = await prisma.wallet.findFirst({
      where: { type: PrismaWalletType.SYSTEM },
    });
    if (!systemWallet) {
      const createdSys = await prisma.wallet.create({
        data: {
          type: PrismaWalletType.SYSTEM,
          balance: 10000000n,
          isActive: true,
          currency: 'BDT',
        },
      });
      systemWalletId = createdSys.id;
    } else {
      systemWalletId = systemWallet.id;
    }

    const hashedPin = await passwordService.hash(defaultPin);

    // 1. Seed Admin
    const adminUser = await prisma.user.create({
      data: {
        phone: adminPhone,
        pin: hashedPin,
        role: PrismaRole.ADMIN,
        status: PrismaAccountStatus.ACTIVE,
      },
    });
    adminUserId = adminUser.id;
    createdUserIds.push(adminUserId);

    // 2. Seed Customer (ACTIVE, wallet balance 500,000 minor units = 5000.00 BDT)
    const customerUser = await prisma.user.create({
      data: {
        phone: customerPhone,
        pin: hashedPin,
        role: PrismaRole.CUSTOMER,
        status: PrismaAccountStatus.ACTIVE,
      },
    });
    customerUserId = customerUser.id;
    createdUserIds.push(customerUserId);

    const customerWallet = await prisma.wallet.create({
      data: {
        userId: customerUserId,
        type: PrismaWalletType.PERSONAL,
        balance: 500000n,
        isActive: true,
        currency: 'BDT',
      },
    });
    customerWalletId = customerWallet.id;

    // Seed customer trusted device with session
    initialSid = randomUUID();
    initialJti = randomUUID();
    await prisma.trustDevice.create({
      data: {
        userId: customerUserId,
        deviceId: customerDeviceId,
        isAuthorized: true,
        refreshSessionId: initialSid,
        currentRefreshJti: initialJti,
      },
    });

    // 3. Seed Recipient Customer
    const recipientUser = await prisma.user.create({
      data: {
        phone: recipientPhone,
        pin: hashedPin,
        role: PrismaRole.CUSTOMER,
        status: PrismaAccountStatus.ACTIVE,
      },
    });
    recipientUserId = recipientUser.id;
    createdUserIds.push(recipientUserId);

    const recWallet = await prisma.wallet.create({
      data: {
        userId: recipientUserId,
        type: PrismaWalletType.PERSONAL,
        balance: 100000n,
        isActive: true,
        currency: 'BDT',
      },
    });
    recipientWalletId = recWallet.id;

    // 4. Seed Agent
    const agentUser = await prisma.user.create({
      data: {
        phone: agentPhone,
        pin: hashedPin,
        role: PrismaRole.AGENT,
        status: PrismaAccountStatus.ACTIVE,
      },
    });
    agentUserId = agentUser.id;
    createdUserIds.push(agentUserId);

    await prisma.wallet.create({
      data: {
        userId: agentUserId,
        type: PrismaWalletType.AGENT,
        balance: 1000000n,
        isActive: true,
        currency: 'BDT',
      },
    });

    // 5. Seed Merchant
    const merchantUser = await prisma.user.create({
      data: {
        phone: merchantPhone,
        pin: hashedPin,
        role: PrismaRole.MERCHANT,
        status: PrismaAccountStatus.ACTIVE,
      },
    });
    merchantUserId = merchantUser.id;
    createdUserIds.push(merchantUserId);

    const merWallet = await prisma.wallet.create({
      data: {
        userId: merchantUserId,
        type: PrismaWalletType.MERCHANT,
        balance: 200000n,
        isActive: true,
        currency: 'BDT',
      },
    });
    merchantWalletId = merWallet.id;

    // 6. Seed Locked User
    const lockedUser = await prisma.user.create({
      data: {
        phone: lockedPhone,
        pin: hashedPin,
        role: PrismaRole.CUSTOMER,
        status: PrismaAccountStatus.LOCKED,
      },
    });
    lockedUserId = lockedUser.id;
    createdUserIds.push(lockedUserId);

    await prisma.wallet.create({
      data: {
        userId: lockedUserId,
        type: PrismaWalletType.PERSONAL,
        balance: 50000n,
        isActive: true,
        currency: 'BDT',
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && createdUserIds.length > 0) {
        await cleanupDatabaseForUsers({ ids: createdUserIds });
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  async function createAccessToken(
    userId: string,
    role: Role,
  ): Promise<string> {
    return jwtService.signAsync(
      { sub: userId, role },
      {
        secret: configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  async function createRefreshToken(
    userId: string,
    deviceId: string,
    sid: string,
    jti: string,
  ): Promise<string> {
    return jwtService.signAsync(
      { sub: userId, deviceId, sid, jti, tokenUse: 'refresh' },
      {
        secret: configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: '7d',
      },
    );
  }

  // =========================================================================
  // TEST GROUP A — Wallet freeze semantics (Integration)
  // =========================================================================
  describe('Test Group A — Wallet freeze semantics', () => {
    it('should allow an administrator to freeze an active personal wallet and verify isActive=false in database', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/wallets/${recipientWalletId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as WalletOwnerHttpDto;
      expect(body.id).toBe(recipientWalletId);
      expect(body.isActive).toBe(false);

      const dbWallet = await prisma.wallet.findUnique({
        where: { id: recipientWalletId },
      });
      expect(dbWallet?.isActive).toBe(false);
    });

    it('should allow an active customer to view their balance even when their wallet is frozen', async () => {
      // Recipient is an ACTIVE user with a frozen wallet
      const recipientToken = await createAccessToken(
        recipientUserId,
        Role.CUSTOMER,
      );

      const response = await request(server)
        .get('/api/v1/wallets/my-balance')
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);

      const body = response.body as unknown as WalletBalanceHttpDto;
      expect(body.balance).toBe('100000');
      expect(body.isActive).toBe(false);
      expect(body.type).toBe('PERSONAL');
      expect(typeof body.balance).toBe('string');
    });

    it('should reject deactivating an already frozen wallet with 409 Conflict', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/wallets/${recipientWalletId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('WALLET_STATE_CHANGED');
    });

    it('should protect the SYSTEM operational wallet from administrative deactivation with 409 Conflict', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/wallets/${systemWalletId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('SYSTEM_WALLET_PROTECTED');
    });

    it('should protect the SYSTEM operational wallet from administrative activation with 409 Conflict', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/wallets/${systemWalletId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('SYSTEM_WALLET_PROTECTED');
    });

    it('should allow an administrator to activate a frozen wallet owned by an active customer', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/wallets/${recipientWalletId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as WalletOwnerHttpDto;
      expect(body.id).toBe(recipientWalletId);
      expect(body.isActive).toBe(true);

      const dbWallet = await prisma.wallet.findUnique({
        where: { id: recipientWalletId },
      });
      expect(dbWallet?.isActive).toBe(true);
    });
  });

  // =========================================================================
  // TEST GROUP B — Administrative suspension
  // =========================================================================
  describe('Test Group B — Administrative suspension', () => {
    let customerOldAccessToken: string;
    let customerOldRefreshToken: string;
    let ledgerCountBefore: number;
    let balanceBefore: bigint;

    it('should record baseline database state before suspension with active user, active wallet, and valid device session', async () => {
      customerOldAccessToken = await createAccessToken(
        customerUserId,
        Role.CUSTOMER,
      );
      customerOldRefreshToken = await createRefreshToken(
        customerUserId,
        customerDeviceId,
        initialSid,
        initialJti,
      );

      const user = await prisma.user.findUnique({
        where: { id: customerUserId },
      });
      const wallet = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });
      const device = await prisma.trustDevice.findUnique({
        where: {
          userId_deviceId: {
            userId: customerUserId,
            deviceId: customerDeviceId,
          },
        },
      });

      expect(user?.status).toBe(PrismaAccountStatus.ACTIVE);
      expect(wallet?.isActive).toBe(true);
      expect(wallet?.balance).toBe(500000n);
      expect(device?.isAuthorized).toBe(true);
      expect(device?.refreshSessionId).toBe(initialSid);
      expect(device?.currentRefreshJti).toBe(initialJti);

      balanceBefore = wallet!.balance;
      ledgerCountBefore = await prisma.ledgerEntry.count({
        where: { walletId: customerWalletId },
      });
    });

    it('should execute administrative suspension via PATCH /admin/accounts/:userId/suspend', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/admin/accounts/${customerUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as AccountRestrictionHttpDto;
      expect(body).toEqual({
        userId: customerUserId,
        status: 'SUSPENDED',
      });
    });

    it('should verify database state after suspension has User.status=SUSPENDED, Wallet.isActive=false, and device sessions revoked', async () => {
      const user = await prisma.user.findUnique({
        where: { id: customerUserId },
      });
      const wallet = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });
      const device = await prisma.trustDevice.findUnique({
        where: {
          userId_deviceId: {
            userId: customerUserId,
            deviceId: customerDeviceId,
          },
        },
      });

      expect(user?.status).toBe(PrismaAccountStatus.SUSPENDED);
      expect(wallet?.isActive).toBe(false);
      expect(device?.isAuthorized).toBe(true);
      expect(device?.refreshSessionId).toBeNull();
      expect(device?.currentRefreshJti).toBeNull();

      // Wallet balance and ledger records remain untouched
      expect(wallet?.balance).toBe(balanceBefore);
      const ledgerCountAfter = await prisma.ledgerEntry.count({
        where: { walletId: customerWalletId },
      });
      expect(ledgerCountAfter).toBe(ledgerCountBefore);
    });

    it('should deny API access with 403 Forbidden when a suspended user presents their previously issued access JWT', async () => {
      const response = await request(server)
        .get('/api/v1/wallets/my-balance')
        .set('Authorization', `Bearer ${customerOldAccessToken}`)
        .expect(403);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.message).toBe(
        'Your account is currently restricted. Please contact support.',
      );
    });

    it('should reject token refresh when a suspended user presents an old refresh cookie', async () => {
      const response = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${customerOldRefreshToken}`])
        .expect(401);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('SESSION_INVALID');
    });

    it('should execute suspension idempotently when repeated on an already suspended account', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/admin/accounts/${customerUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as AccountRestrictionHttpDto;
      expect(body).toEqual({
        userId: customerUserId,
        status: 'SUSPENDED',
      });
    });

    it('should prevent targeting an administrator account and return 404 NotFoundException', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/admin/accounts/${adminUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('should protect a locked account and prevent status alteration by returning 404 NotFoundException', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/admin/accounts/${lockedUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('ACCOUNT_NOT_FOUND');

      const lockedUser = await prisma.user.findUnique({
        where: { id: lockedUserId },
      });
      expect(lockedUser?.status).toBe(PrismaAccountStatus.LOCKED);
    });

    it('should reject wallet activation with 409 Conflict when the owner account is suspended', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/wallets/${customerWalletId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('ACCOUNT_NOT_ACTIVE');

      const wallet = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });
      expect(wallet?.isActive).toBe(false);
    });
  });

  // =========================================================================
  // TEST GROUP C — Reactivation
  // =========================================================================
  describe('Test Group C — Reactivation', () => {
    it('should reactivate a user account to ACTIVE while strictly maintaining wallet.isActive=false', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      const response = await request(server)
        .patch(`/api/v1/admin/accounts/${customerUserId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown as AccountRestrictionHttpDto;
      expect(body).toEqual({
        userId: customerUserId,
        status: 'ACTIVE',
      });

      const user = await prisma.user.findUnique({
        where: { id: customerUserId },
      });
      const wallet = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });

      expect(user?.status).toBe(PrismaAccountStatus.ACTIVE);
      // Unfreezing separation: Wallet remains false!
      expect(wallet?.isActive).toBe(false);
    });

    it('should ensure previously issued refresh tokens remain invalidated after account reactivation', async () => {
      const oldRefreshToken = await createRefreshToken(
        customerUserId,
        customerDeviceId,
        initialSid,
        initialJti,
      );

      const response = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${oldRefreshToken}`])
        .expect(401);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('SESSION_INVALID');
    });

    it('should permit establishing a fresh session via PIN login from an existing trusted device', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          phone: customerPhone,
          pin: defaultPin,
          deviceId: customerDeviceId,
        })
        .expect(200);

      const body = response.body as unknown as AuthTokensHttpDto;
      expect(body.accessToken).toBeDefined();

      const device = await prisma.trustDevice.findUnique({
        where: {
          userId_deviceId: {
            userId: customerUserId,
            deviceId: customerDeviceId,
          },
        },
      });
      expect(device?.refreshSessionId).not.toBeNull();
      expect(device?.currentRefreshJti).not.toBeNull();
    });

    it('should allow a reactivated user to inspect their balance with isActive=false', async () => {
      const token = await createAccessToken(customerUserId, Role.CUSTOMER);

      const response = await request(server)
        .get('/api/v1/wallets/my-balance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as unknown as WalletBalanceHttpDto;
      expect(body.balance).toBe('500000');
      expect(body.isActive).toBe(false);
      expect(typeof body.balance).toBe('string');
    });

    it('should reject financial transactions while the wallet remains frozen after account reactivation', async () => {
      const token = await createAccessToken(customerUserId, Role.CUSTOMER);

      // Pre-flight check rejects frozen wallet
      await request(server)
        .post('/api/v1/transactions/send')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', randomUUID())
        .send({
          recipientPhone: recipientPhone,
          amountMinorUnits: '5000',
          reference: 'Transfer while frozen',
        })
        .expect(404);
    });

    it('should restore full financial transaction capability after separate administrator wallet activation', async () => {
      const adminToken = await createAccessToken(adminUserId, Role.ADMIN);

      await request(server)
        .patch(`/api/v1/wallets/${customerWalletId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const wallet = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });
      expect(wallet?.isActive).toBe(true);

      // Now send money succeeds!
      const customerToken = await createAccessToken(
        customerUserId,
        Role.CUSTOMER,
      );
      const trxResponse = await request(server)
        .post('/api/v1/transactions/send')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', randomUUID())
        .send({
          recipientPhone: recipientPhone,
          amountMinorUnits: '5000',
          reference: 'Transfer after activation',
        })
        .expect(201);

      const body = trxResponse.body as unknown as TransactionResultHttpDto;
      expect(body.trxId).toBeDefined();
      expect(body.amount).toBe('5000');
    });
  });

  // =========================================================================
  // TEST GROUP D — Financial participant restrictions & Inconsistent State
  // =========================================================================
  describe('Test Group D — Financial participant restrictions', () => {
    it('should defend against inconsistent database state by blocking payment to a suspended merchant with an active wallet', async () => {
      // 1. Deliberately seed inconsistent data: Merchant status SUSPENDED, but wallet isActive = true
      await prisma.user.update({
        where: { id: merchantUserId },
        data: { status: PrismaAccountStatus.SUSPENDED },
      });
      await prisma.wallet.update({
        where: { id: merchantWalletId },
        data: { isActive: true },
      });

      const customerWalletBefore = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });
      const merchantWalletBefore = await prisma.wallet.findUnique({
        where: { id: merchantWalletId },
      });
      const ledgerCountBefore = await prisma.ledgerEntry.count();
      const transactionCountBefore = await prisma.transaction.count();

      // 2. Active customer submits payment
      const customerToken = await createAccessToken(
        customerUserId,
        Role.CUSTOMER,
      );
      const response = await request(server)
        .post('/api/v1/transactions/payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', randomUUID())
        .send({
          merchantPhone: merchantPhone,
          amountMinorUnits: '10000',
          invoiceNumber: 'INV-TEST-99',
        })
        .expect(403);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');
      expect(body.message).toBe(
        'One or more transaction participants are restricted.',
      );

      // 3. Invariant Verification: Balances unchanged, no new transactions or ledger entries
      const customerWalletAfter = await prisma.wallet.findUnique({
        where: { id: customerWalletId },
      });
      const merchantWalletAfter = await prisma.wallet.findUnique({
        where: { id: merchantWalletId },
      });
      const ledgerCountAfter = await prisma.ledgerEntry.count();
      const transactionCountAfter = await prisma.transaction.count();

      expect(customerWalletAfter?.balance).toBe(customerWalletBefore?.balance);
      expect(merchantWalletAfter?.balance).toBe(merchantWalletBefore?.balance);
      expect(ledgerCountAfter).toBe(ledgerCountBefore);
      expect(transactionCountAfter).toBe(transactionCountBefore);

      // Restore Merchant to ACTIVE for clean state
      await prisma.user.update({
        where: { id: merchantUserId },
        data: { status: PrismaAccountStatus.ACTIVE },
      });
    });

    it('should abort Cash In with 403 Forbidden when the customer account is suspended', async () => {
      // Suspend recipient customer
      await prisma.user.update({
        where: { id: recipientUserId },
        data: { status: PrismaAccountStatus.SUSPENDED },
      });

      const agentToken = await createAccessToken(agentUserId, Role.AGENT);
      const response = await request(server)
        .post('/api/v1/transactions/cash-in')
        .set('Authorization', `Bearer ${agentToken}`)
        .set('x-idempotency-key', randomUUID())
        .send({
          customerPhone: recipientPhone,
          amountMinorUnits: '10000',
          reference: 'Cash in to suspended',
        })
        .expect(403);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');

      // Restore recipient customer
      await prisma.user.update({
        where: { id: recipientUserId },
        data: { status: PrismaAccountStatus.ACTIVE },
      });
    });

    it('should abort Cash Out with 403 Forbidden when the agent account is suspended', async () => {
      // Suspend agent
      await prisma.user.update({
        where: { id: agentUserId },
        data: { status: PrismaAccountStatus.SUSPENDED },
      });

      const customerToken = await createAccessToken(
        customerUserId,
        Role.CUSTOMER,
      );
      const response = await request(server)
        .post('/api/v1/transactions/cash-out')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', randomUUID())
        .send({
          agentPhone: agentPhone,
          amountMinorUnits: '10000',
          reference: 'Cash out to suspended agent',
        })
        .expect(403);

      const body = response.body as unknown as ErrorEnvelopeHttpDto;
      expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');

      // Restore agent
      await prisma.user.update({
        where: { id: agentUserId },
        data: { status: PrismaAccountStatus.ACTIVE },
      });
    });
  });

  // =========================================================================
  // TEST GROUP E — Atomic rollback (PostgreSQL Integration)
  // =========================================================================
  describe('Test Group E — Atomic rollback', () => {
    it('should roll back both user suspension and wallet freeze if session-clearing operation fails within the database transaction', async () => {
      // Ensure target user is ACTIVE and wallet is active
      await prisma.user.update({
        where: { id: recipientUserId },
        data: { status: PrismaAccountStatus.ACTIVE },
      });
      await prisma.wallet.update({
        where: { id: recipientWalletId },
        data: { isActive: true },
      });

      // Execute a transactional operation that updates wallet & user, then deliberately fails on step 3
      await expect(
        prisma.$transaction(async (tx) => {
          // 1. Freeze wallet
          await tx.wallet.updateMany({
            where: { id: recipientWalletId },
            data: { isActive: false },
          });

          // 2. Suspend user
          await tx.user.updateMany({
            where: { id: recipientUserId },
            data: { status: PrismaAccountStatus.SUSPENDED },
          });

          // 3. Deliberately throw an error (simulating session-clearing failure)
          throw new Error('Simulated session clearing failure');
        }),
      ).rejects.toThrow('Simulated session clearing failure');

      // Assert PostgreSQL rolled back both earlier changes:
      const userAfter = await prisma.user.findUnique({
        where: { id: recipientUserId },
      });
      const walletAfter = await prisma.wallet.findUnique({
        where: { id: recipientWalletId },
      });

      expect(userAfter?.status).toBe(PrismaAccountStatus.ACTIVE);
      expect(walletAfter?.isActive).toBe(true);
    });
  });
});
