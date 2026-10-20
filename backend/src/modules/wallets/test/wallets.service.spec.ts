import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WalletsService } from '../wallets.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { WalletType as PrismaWalletType } from 'generated/prisma/enums';
import { WalletType } from 'src/domain/enums';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { WalletId } from 'src/domain/value-objects/wallet-id.vo';
import { Prisma } from 'generated/prisma/client';
import { WalletOwnerResponse } from '../interfaces/wallet-interface';

interface WalletDbRecord {
  id: string;
  userId: string | null;
  balance: bigint;
  type: PrismaWalletType;
  currency: string;
  isActive: boolean;
  createdAT: Date;
  updatedAt: Date;
}

interface UserDbRecord {
  id: string;
  status: string;
  role: string;
}

interface PrismaMock {
  wallet: {
    findUnique: jest.Mock<
      Promise<Partial<WalletDbRecord> | null>,
      [Prisma.WalletFindUniqueArgs]
    >;
    updateMany: jest.Mock<
      Promise<Prisma.BatchPayload>,
      [Prisma.WalletUpdateManyArgs]
    >;
    create: jest.Mock<
      Promise<Partial<WalletDbRecord>>,
      [Prisma.WalletCreateArgs]
    >;
  };
  user: {
    findUnique: jest.Mock<
      Promise<Partial<UserDbRecord> | null>,
      [Prisma.UserFindUniqueArgs]
    >;
  };
  $transaction: jest.Mock;
}

describe('WalletsService — Core Domain & Wallet Freeze Semantics', () => {
  let service: WalletsService;
  let prismaMock: PrismaMock;

  const testUserId = UserId.from('11111111-1111-4111-8111-111111111111');
  const testWalletId = WalletId.from('22222222-2222-4222-8222-222222222222');
  const systemWalletId = WalletId.from('33333333-3333-4333-8333-333333333333');

  beforeEach(async () => {
    prismaMock = {
      wallet: {
        findUnique: jest.fn<
          Promise<Partial<WalletDbRecord> | null>,
          [Prisma.WalletFindUniqueArgs]
        >(),
        updateMany: jest.fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.WalletUpdateManyArgs]
        >(),
        create: jest.fn<
          Promise<Partial<WalletDbRecord>>,
          [Prisma.WalletCreateArgs]
        >(),
      },
      user: {
        findUnique: jest.fn<
          Promise<Partial<UserDbRecord> | null>,
          [Prisma.UserFindUniqueArgs]
        >(),
      },
      $transaction: jest.fn(
        (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          return callback(prismaMock as unknown as Prisma.TransactionClient);
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when querying wallet balance (getMyBalance)', () => {
    it('should allow an active customer to view their balance even when the wallet is frozen', async () => {
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        balance: 500000n,
        type: PrismaWalletType.PERSONAL,
        currency: 'BDT',
        isActive: false,
      });

      const result = await service.getMyBalance(testUserId);

      expect(result.id).toBe(testWalletId.value);
      expect(result.balance).toBe(500000n);
      expect(result.isActive).toBe(false);
      expect(result.type).toBe(WalletType.PERSONAL);
      expect(result.currency).toBe('BDT');
      expect(prismaMock.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: testUserId.value },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
        },
      });
    });

    it('should throw NotFoundException when no wallet exists for the specified user', async () => {
      prismaMock.wallet.findUnique.mockResolvedValueOnce(null);

      await expect(service.getMyBalance(testUserId)).rejects.toThrow(
        new NotFoundException(
          'No wallet found for this account. Contact Support',
        ),
      );
    });
  });

  describe('when deactivating a personal wallet (deactiveWallet)', () => {
    it('should freeze an active personal wallet and return isActive=false upon administrator request', async () => {
      // 1. assertManageableWallet lookup
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });

      // 2. updateMany sets isActive = false
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 1 });

      // 3. getWalletById returns updated snapshot
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        balance: 500000n,
        type: PrismaWalletType.PERSONAL,
        isActive: false,
        currency: 'BDT',
        createdAT: new Date(),
        userId: testUserId.value,
      });

      const result = await service.deactiveWallet(testWalletId);

      expect(result.id).toBe(testWalletId.value);
      expect(result.isActive).toBe(false);
      expect(result.type).toBe(WalletType.PERSONAL);
      expect(prismaMock.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: testWalletId.value,
          isActive: true,
          userId: { not: null },
          type: { not: PrismaWalletType.SYSTEM },
        },
        data: { isActive: false },
      });
    });

    it('should reject deactivation with 409 Conflict (WALLET_STATE_CHANGED) when the wallet is already frozen', async () => {
      // assertManageableWallet succeeds
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });

      // updateMany finds 0 rows because isActive is already false
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 0 });

      try {
        await service.deactiveWallet(testWalletId);
        fail('Expected ConflictException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        const response = conflict.getResponse() as {
          code: string;
          message: string;
        };
        expect(response.code).toBe('WALLET_STATE_CHANGED');
        expect(response.message).toBe(
          'Wallet is already frozen or its state changed.',
        );
      }
    });

    it('should serialize concurrent freeze requests and allow at most one state transition when two admins race', async () => {
      // Request 1 assertManageableWallet
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });
      // Request 2 assertManageableWallet
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });

      // Request 1 succeeds in conditional update
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 1 });
      // Request 2 finds 0 rows
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 0 });

      // Request 1 getWalletById
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        balance: 500000n,
        type: PrismaWalletType.PERSONAL,
        isActive: false,
        currency: 'BDT',
        createdAT: new Date(),
        userId: testUserId.value,
      });

      const results = await Promise.allSettled([
        service.deactiveWallet(testWalletId),
        service.deactiveWallet(testWalletId),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<WalletOwnerResponse> =>
          r.status === 'fulfilled',
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    });

    it('should protect the SYSTEM operational wallet and reject deactivation with 409 Conflict (SYSTEM_WALLET_PROTECTED)', async () => {
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: systemWalletId.value,
        type: PrismaWalletType.SYSTEM,
        userId: null,
      });

      try {
        await service.deactiveWallet(systemWalletId);
        fail('Expected ConflictException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        const response = conflict.getResponse() as {
          code: string;
          message: string;
        };
        expect(response.code).toBe('SYSTEM_WALLET_PROTECTED');
        expect(response.message).toContain(
          'The SYSTEM wallet cannot be frozen or activated',
        );
      }
    });
  });

  describe('when activating a personal wallet (activeWallet)', () => {
    it('should protect the SYSTEM operational wallet and reject activation with 409 Conflict (SYSTEM_WALLET_PROTECTED)', async () => {
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: systemWalletId.value,
        type: PrismaWalletType.SYSTEM,
        userId: null,
      });

      try {
        await service.activeWallet(systemWalletId);
        fail('Expected ConflictException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        const response = conflict.getResponse() as {
          code: string;
          message: string;
        };
        expect(response.code).toBe('SYSTEM_WALLET_PROTECTED');
        expect(response.message).toContain(
          'The SYSTEM wallet cannot be frozen or activated',
        );
      }
    });

    it('should prevent wallet activation with 409 Conflict (ACCOUNT_NOT_ACTIVE) when the owner account is suspended', async () => {
      // 1. assertManageableWallet lookup
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });

      // 2. Inside transaction: updateMany succeeds initially
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 1 });

      // 3. User verification check inside transaction:
      // User status is SUSPENDED, so wallet with user.status = ACTIVE is NOT found
      prismaMock.wallet.findUnique.mockResolvedValueOnce(null);

      try {
        await service.activeWallet(testWalletId);
        fail('Expected ConflictException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        const response = conflict.getResponse() as {
          code: string;
          message: string;
        };
        expect(response.code).toBe('ACCOUNT_NOT_ACTIVE');
        expect(response.message).toBe(
          'Cannot activate a wallet whose owner account is restricted.',
        );
      }
    });

    it('should activate a frozen wallet and return isActive=true when the owner account is in good standing (ACTIVE)', async () => {
      // 1. assertManageableWallet lookup
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });

      // 2. Inside transaction: updateMany sets isActive = true
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 1 });

      // 3. Owner check: user status is ACTIVE, so record is found
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
      });

      // 4. getWalletById returns updated snapshot
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        balance: 500000n,
        type: PrismaWalletType.PERSONAL,
        isActive: true,
        currency: 'BDT',
        createdAT: new Date(),
        userId: testUserId.value,
      });

      const result = await service.activeWallet(testWalletId);

      expect(result.id).toBe(testWalletId.value);
      expect(result.isActive).toBe(true);
      expect(result.type).toBe(WalletType.PERSONAL);
    });

    it('should reject activation with 409 Conflict (WALLET_STATE_CHANGED) when the wallet is already active', async () => {
      // assertManageableWallet lookup
      prismaMock.wallet.findUnique.mockResolvedValueOnce({
        id: testWalletId.value,
        type: PrismaWalletType.PERSONAL,
        userId: testUserId.value,
      });

      // updateMany matches 0 rows because wallet is already isActive=true
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.activeWallet(testWalletId)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
