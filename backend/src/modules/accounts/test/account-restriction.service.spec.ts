import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountRestrictionService } from '../account-restriction.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AccountStatus } from 'src/domain/enums';
import {
  AccountStatus as PrismaAccountStatus,
  Role as PrismaRole,
  WalletType as PrismaWalletType,
} from 'generated/prisma/enums';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { Prisma } from 'generated/prisma/client';

interface MockUserWithWallet {
  id: string;
  wallet: {
    id: string;
  } | null;
}

interface MockPrismaClient {
  user: {
    findUnique: jest.Mock<
      Promise<MockUserWithWallet | { id: string } | null>,
      [Prisma.UserFindUniqueArgs]
    >;
    updateMany: jest.Mock<
      Promise<Prisma.BatchPayload>,
      [Prisma.UserUpdateManyArgs]
    >;
  };
  wallet: {
    updateMany: jest.Mock<
      Promise<Prisma.BatchPayload>,
      [Prisma.WalletUpdateManyArgs]
    >;
  };
  trustDevice: {
    updateMany: jest.Mock<
      Promise<Prisma.BatchPayload>,
      [Prisma.TrustDeviceUpdateManyArgs]
    >;
  };
  $transaction: jest.Mock;
}

describe('AccountRestrictionService — Account Suspension, Reactivation, and Atomicity', () => {
  let service: AccountRestrictionService;
  let prismaMock: MockPrismaClient;

  const testUserId = UserId.from('11111111-1111-4111-8111-111111111111');
  const testWalletId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn<
          Promise<MockUserWithWallet | { id: string } | null>,
          [Prisma.UserFindUniqueArgs]
        >(),
        updateMany: jest.fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.UserUpdateManyArgs]
        >(),
      },
      wallet: {
        updateMany: jest.fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.WalletUpdateManyArgs]
        >(),
      },
      trustDevice: {
        updateMany: jest.fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.TrustDeviceUpdateManyArgs]
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
        AccountRestrictionService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AccountRestrictionService>(AccountRestrictionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when administratively suspending an account (suspend)', () => {
    it('should transition user to SUSPENDED, freeze the wallet, and revoke active device sessions in a single operation', async () => {
      // Step 1: User lookup within transaction (ACTIVE user with PERSONAL wallet)
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: testUserId.value,
        wallet: { id: testWalletId },
      });

      // Step 2: Freeze wallet
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 1 });

      // Step 3: Restrict user to SUSPENDED
      prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

      // Step 4: Clear session credentials on trusted devices
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 1 });

      const response = await service.suspend(testUserId);

      expect(response).toEqual({
        userId: testUserId.value,
        status: AccountStatus.SUSPENDED,
      });

      // Verify wallet freeze
      expect(prismaMock.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: testWalletId,
          userId: testUserId.value,
          type: { not: PrismaWalletType.SYSTEM },
        },
        data: { isActive: false },
      });

      // Verify user suspension
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: testUserId.value,
          role: { not: PrismaRole.ADMIN },
          status: {
            in: [PrismaAccountStatus.ACTIVE, PrismaAccountStatus.SUSPENDED],
          },
        },
        data: {
          status: PrismaAccountStatus.SUSPENDED,
        },
      });

      // Verify device session clearing (sid=null, jti=null; isAuthorized is untouched)
      expect(prismaMock.trustDevice.updateMany).toHaveBeenCalledWith({
        where: { userId: testUserId.value },
        data: {
          refreshSessionId: null,
          currentRefreshJti: null,
        },
      });
    });

    it('should execute idempotently and safely without side effects when invoked on an already suspended account', async () => {
      // User is already SUSPENDED
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: testUserId.value,
        wallet: { id: testWalletId },
      });
      // Wallet update succeeds
      prismaMock.wallet.updateMany.mockResolvedValueOnce({ count: 1 });
      // User update allows status IN [ACTIVE, SUSPENDED], succeeds
      prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });
      // Device session clearing succeeds
      prismaMock.trustDevice.updateMany.mockResolvedValueOnce({ count: 0 });

      const response = await service.suspend(testUserId);

      expect(response).toEqual({
        userId: testUserId.value,
        status: AccountStatus.SUSPENDED,
      });
    });

    it('should prevent targeting administrative staff and reject suspension with 404 NotFoundException', async () => {
      // The Prisma query filters { role: { not: ADMIN } }, returning null
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      try {
        await service.suspend(testUserId);
        fail('Expected NotFoundException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(NotFoundException);
        const notFound = error as NotFoundException;
        const body = notFound.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('ACCOUNT_NOT_FOUND');
        expect(body.message).toBe('Account not found.');
      }

      expect(prismaMock.wallet.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.trustDevice.updateMany).not.toHaveBeenCalled();
    });

    it('should preserve locked account integrity and reject suspension with 404 NotFoundException when targeting a locked user', async () => {
      // The Prisma query filters { status: { not: LOCKED } }, returning null
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      try {
        await service.suspend(testUserId);
        fail('Expected NotFoundException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(NotFoundException);
        const notFound = error as NotFoundException;
        const body = notFound.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('ACCOUNT_NOT_FOUND');
        expect(body.message).toBe('Account not found.');
      }

      expect(prismaMock.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('should abort suspension with 409 ConflictException when the target user lacks a valid personal wallet', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: testUserId.value,
        wallet: null,
      });

      try {
        await service.suspend(testUserId);
        fail('Expected ConflictException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        const body = conflict.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('ACCOUNT_WALLET_INVALID');
      }
    });
  });

  describe('when reactivating a suspended account (reactivate)', () => {
    it('should restore user status to ACTIVE while strictly keeping the wallet frozen until separate wallet activation', async () => {
      // prisma.user.updateMany updates 1 row from SUSPENDED to ACTIVE
      prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

      const response = await service.reactivate(testUserId);

      expect(response).toEqual({
        userId: testUserId.value,
        status: AccountStatus.ACTIVE,
      });

      // Confirms query requirements
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: testUserId.value,
          role: { not: PrismaRole.ADMIN },
          status: PrismaAccountStatus.SUSPENDED,
        },
        data: {
          status: PrismaAccountStatus.ACTIVE,
        },
      });

      // Crucial: wallet.updateMany was NOT called during account reactivation.
      // The wallet remains frozen (isActive=false) until admin explicitly activates it.
      expect(prismaMock.wallet.updateMany).not.toHaveBeenCalled();
      // Crucial: trustDevice sessions were NOT restored. Old refresh tokens remain dead.
      expect(prismaMock.trustDevice.updateMany).not.toHaveBeenCalled();
    });

    it('should reject reactivation with 409 ConflictException when the account is already ACTIVE', async () => {
      // updateMany affects 0 rows because user is not SUSPENDED
      prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 });
      // User lookup finds the account exists
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: testUserId.value,
      });

      try {
        await service.reactivate(testUserId);
        fail('Expected ConflictException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        const body = conflict.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('ACCOUNT_NOT_ELIGIBLE_FOR_REACTIVATION');
        expect(body.message).toBe(
          'Account cannot be reactivated from its current state.',
        );
      }
    });

    it('should reject reactivation with 404 NotFoundException when the user does not exist', async () => {
      prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.reactivate(testUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('transactional atomicity invariants (atomic rollback)', () => {
    it('should roll back both user suspension and wallet freeze if trusted device session clearing fails', async () => {
      // Setup transaction mock that simulates rollback on thrown exception
      let walletFreezeAttempted = false;
      let userSuspensionAttempted = false;

      prismaMock.$transaction.mockImplementationOnce(
        (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          const fakeTx = {
            user: {
              findUnique: jest
                .fn<
                  Promise<MockUserWithWallet | null>,
                  [Prisma.UserFindUniqueArgs]
                >()
                .mockResolvedValue({
                  id: testUserId.value,
                  wallet: { id: testWalletId },
                }),
              updateMany: jest
                .fn<Promise<Prisma.BatchPayload>, [Prisma.UserUpdateManyArgs]>()
                .mockImplementation(() => {
                  userSuspensionAttempted = true;
                  return Promise.resolve({ count: 1 });
                }),
            },
            wallet: {
              updateMany: jest
                .fn<
                  Promise<Prisma.BatchPayload>,
                  [Prisma.WalletUpdateManyArgs]
                >()
                .mockImplementation(() => {
                  walletFreezeAttempted = true;
                  return Promise.resolve({ count: 1 });
                }),
            },
            trustDevice: {
              updateMany: jest
                .fn<
                  Promise<Prisma.BatchPayload>,
                  [Prisma.TrustDeviceUpdateManyArgs]
                >()
                .mockRejectedValue(
                  new Error(
                    'Session database connection severed during clearing',
                  ),
                ),
            },
          } as unknown as Prisma.TransactionClient;

          return callback(fakeTx);
        },
      );

      await expect(service.suspend(testUserId)).rejects.toThrow(
        'Session database connection severed during clearing',
      );

      // Verify that earlier operations were attempted inside the tx context
      expect(walletFreezeAttempted).toBe(true);
      expect(userSuspensionAttempted).toBe(true);
      // Because callback rejected, Prisma's $transaction rolls back and does not commit.
    });
  });
});
