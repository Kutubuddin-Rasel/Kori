import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from '../transactions.service';
import { WalletsService } from '../../wallets/wallets.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { WalletType as PrismaWalletType } from 'generated/prisma/enums';
import { Currency, WalletType } from 'src/domain/enums';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { WalletId } from 'src/domain/value-objects/wallet-id.vo';
import { Prisma } from 'generated/prisma/client';
import { WalletStateForTransaction } from '../../wallets/interfaces/wallet-interface';

interface MockLockedWallet {
  id: string;
  balance: bigint;
  isActive: boolean;
  type: PrismaWalletType;
}

interface MockSystemWallet {
  id: string;
  userId: string | null;
  currency: string;
  isActive: boolean;
}

interface MockPrismaTransactionClient {
  $queryRaw: jest.Mock<
    Promise<unknown[]>,
    [TemplateStringsArray, ...unknown[]]
  >;
  wallet: {
    findUnique: jest.Mock<
      Promise<MockLockedWallet | null>,
      [Prisma.WalletFindUniqueArgs]
    >;
    update: jest.Mock<Promise<MockLockedWallet>, [Prisma.WalletUpdateArgs]>;
  };
  transaction: {
    create: jest.Mock<
      Promise<{
        id: string;
        trxId: string;
        createdAT: Date;
        type: string;
        status: string;
      }>,
      [Prisma.TransactionCreateArgs]
    >;
  };
  ledgerEntry: {
    create: jest.Mock<Promise<{ id: string }>, [Prisma.LedgerEntryCreateArgs]>;
  };
}

describe('TransactionsService — Financial Participant Restrictions & Safety Checks', () => {
  let service: TransactionsService;

  const customerUserId = UserId.from('11111111-1111-4111-8111-111111111111');
  const agentUserId = UserId.from('22222222-2222-4222-8222-222222222222');
  const customerWalletId = WalletId.from(
    '33333333-3333-4333-8333-333333333333',
  );
  const agentWalletId = WalletId.from('44444444-4444-4444-8444-444444444444');
  const merchantWalletId = WalletId.from(
    '55555555-5555-4555-8555-555555555555',
  );
  const systemWalletId = WalletId.from('00000000-0000-4000-8000-000000000000');
  const recipientWalletId = WalletId.from(
    '66666666-6666-4666-8666-666666666666',
  );

  let walletsServiceMock: {
    getOwnWalletId: jest.Mock<Promise<WalletId>, [UserId]>;
    resolveWalletIdByPhone: jest.Mock<Promise<WalletId>, [string]>;
    getWalletStateForTransaction: jest.Mock<
      Promise<WalletStateForTransaction>,
      [WalletId]
    >;
  };

  let txMock: MockPrismaTransactionClient;
  let prismaMock: {
    wallet: {
      findMany: jest.Mock<
        Promise<MockSystemWallet[]>,
        [Prisma.WalletFindManyArgs]
      >;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    walletsServiceMock = {
      getOwnWalletId: jest.fn<Promise<WalletId>, [UserId]>(),
      resolveWalletIdByPhone: jest.fn<Promise<WalletId>, [string]>(),
      getWalletStateForTransaction: jest.fn<
        Promise<WalletStateForTransaction>,
        [WalletId]
      >(),
    };

    txMock = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
        .mockResolvedValue([]),
      wallet: {
        findUnique: jest.fn<
          Promise<MockLockedWallet | null>,
          [Prisma.WalletFindUniqueArgs]
        >(),
        update: jest.fn<Promise<MockLockedWallet>, [Prisma.WalletUpdateArgs]>(),
      },
      transaction: {
        create: jest.fn<
          Promise<{
            id: string;
            trxId: string;
            createdAT: Date;
            type: string;
            status: string;
          }>,
          [Prisma.TransactionCreateArgs]
        >(),
      },
      ledgerEntry: {
        create: jest.fn<
          Promise<{ id: string }>,
          [Prisma.LedgerEntryCreateArgs]
        >(),
      },
    };

    prismaMock = {
      wallet: {
        findMany: jest
          .fn<Promise<MockSystemWallet[]>, [Prisma.WalletFindManyArgs]>()
          .mockResolvedValue([
            {
              id: systemWalletId.value,
              userId: null,
              currency: 'BDT',
              isActive: true,
            },
          ]),
      },
      $transaction: jest.fn(
        (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          return callback(txMock as unknown as Prisma.TransactionClient);
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: WalletsService,
          useValue: walletsServiceMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    await service.onModuleInit();
    jest.clearAllMocks();
  });

  describe('pre-flight eligibility verification (Send Money)', () => {
    it('should reject Send Money before financial writes when the sender wallet is frozen', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(customerWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        recipientWalletId,
      );

      // Pre-flight check rejects sender as frozen
      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(customerWalletId)) {
            return Promise.reject(
              new NotFoundException(
                `Wallet with ID:${id.value} does not exist.`,
              ),
            );
          }
          return Promise.resolve({
            id: id.value,
            type: WalletType.PERSONAL,
            balance: 100000n,
            currency: Currency.BDT,
          });
        },
      );

      await expect(
        service.sendMoney(
          customerUserId,
          {
            amountMinorUnits: '5000',
            recipientPhone: '+8801711111111',
            reference: 'Family gift',
          },
          '00000000-0000-0000-0000-000000000001',
        ),
      ).rejects.toThrow(NotFoundException);

      // Assert: No transactions or ledger records created, no balance updates
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.transaction.create).not.toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
      expect(txMock.wallet.update).not.toHaveBeenCalled();
    });

    it('should reject Send Money before financial writes when the recipient wallet is frozen', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(customerWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        recipientWalletId,
      );

      // Pre-flight check rejects receiver as frozen
      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(customerWalletId)) {
            return Promise.resolve({
              id: id.value,
              type: WalletType.PERSONAL,
              balance: 500000n,
              currency: Currency.BDT,
            });
          }
          return Promise.reject(
            new NotFoundException(`Wallet with ID:${id.value} does not exist.`),
          );
        },
      );

      await expect(
        service.sendMoney(
          customerUserId,
          {
            amountMinorUnits: '5000',
            recipientPhone: '+8801711111111',
            reference: 'Groceries',
          },
          '00000000-0000-0000-0000-000000000002',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.transaction.create).not.toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
      expect(txMock.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe('pessimistic lock and participant status validation', () => {
    it('should abort Cash In with 403 Forbidden (TRANSACTION_PARTICIPANT_RESTRICTED) when the customer is suspended', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(agentWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        customerWalletId,
      );

      // Pre-flight check sees active wallet states
      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(agentWalletId)) {
            return Promise.resolve({
              id: id.value,
              type: WalletType.AGENT,
              balance: 1000000n,
              currency: Currency.BDT,
            });
          }
          return Promise.resolve({
            id: id.value,
            type: WalletType.PERSONAL,
            balance: 10000n,
            currency: Currency.BDT,
          });
        },
      );

      // Post-lock check inside ACID transaction:
      // Sender (Agent) is active, System is active, but Receiver (Customer) is SUSPENDED -> returns null
      txMock.wallet.findUnique.mockImplementation(
        (
          args: Prisma.WalletFindUniqueArgs,
        ): Promise<MockLockedWallet | null> => {
          const id = args.where.id;
          if (id === agentWalletId.value) {
            return Promise.resolve({
              id: agentWalletId.value,
              balance: 1000000n,
              isActive: true,
              type: PrismaWalletType.AGENT,
            });
          }
          if (id === systemWalletId.value) {
            return Promise.resolve({
              id: systemWalletId.value,
              balance: 50000n,
              isActive: true,
              type: PrismaWalletType.SYSTEM,
            });
          }
          // Customer account is SUSPENDED: where: { id: customerWalletId.value, user: { status: ACTIVE } } matches null
          return Promise.resolve(null);
        },
      );

      try {
        await service.cashIn(
          agentUserId,
          {
            amountMinorUnits: '10000',
            customerPhone: '+8801722222222',
            reference: 'Cash deposit',
          },
          '00000000-0000-0000-0000-000000000003',
        );
        fail('Expected ForbiddenException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        const body = forbidden.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');
        expect(body.message).toBe(
          'One or more transaction participants are restricted.',
        );
      }

      // Verify 0 financial records written
      expect(txMock.transaction.create).not.toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
      expect(txMock.wallet.update).not.toHaveBeenCalled();
    });

    it('should abort Cash Out with 403 Forbidden (TRANSACTION_PARTICIPANT_RESTRICTED) when the agent is suspended', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(customerWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        agentWalletId,
      );

      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(customerWalletId)) {
            return Promise.resolve({
              id: id.value,
              type: WalletType.PERSONAL,
              balance: 500000n,
              currency: Currency.BDT,
            });
          }
          return Promise.resolve({
            id: id.value,
            type: WalletType.AGENT,
            balance: 200000n,
            currency: Currency.BDT,
          });
        },
      );

      // In post-lock, Agent user is SUSPENDED -> lockedReceiver is null
      txMock.wallet.findUnique.mockImplementation(
        (
          args: Prisma.WalletFindUniqueArgs,
        ): Promise<MockLockedWallet | null> => {
          const id = args.where.id;
          if (id === customerWalletId.value) {
            return Promise.resolve({
              id: customerWalletId.value,
              balance: 500000n,
              isActive: true,
              type: PrismaWalletType.PERSONAL,
            });
          }
          if (id === systemWalletId.value) {
            return Promise.resolve({
              id: systemWalletId.value,
              balance: 50000n,
              isActive: true,
              type: PrismaWalletType.SYSTEM,
            });
          }
          // Agent user is SUSPENDED -> returns null
          return Promise.resolve(null);
        },
      );

      try {
        await service.cashOut(
          customerUserId,
          {
            amountMinorUnits: '20000',
            agentPhone: '+8801733333333',
            reference: 'Cash withdrawal',
          },
          '00000000-0000-0000-0000-000000000004',
        );
        fail('Expected ForbiddenException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        const body = forbidden.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');
      }

      expect(txMock.transaction.create).not.toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
      expect(txMock.wallet.update).not.toHaveBeenCalled();
    });

    it('should abort Payment with 403 Forbidden (TRANSACTION_PARTICIPANT_RESTRICTED) when the merchant is suspended', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(customerWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        merchantWalletId,
      );

      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(customerWalletId)) {
            return Promise.resolve({
              id: id.value,
              type: WalletType.PERSONAL,
              balance: 500000n,
              currency: Currency.BDT,
            });
          }
          return Promise.resolve({
            id: id.value,
            type: WalletType.MERCHANT,
            balance: 300000n,
            currency: Currency.BDT,
          });
        },
      );

      txMock.wallet.findUnique.mockImplementation(
        (
          args: Prisma.WalletFindUniqueArgs,
        ): Promise<MockLockedWallet | null> => {
          const id = args.where.id;
          if (id === customerWalletId.value) {
            return Promise.resolve({
              id: customerWalletId.value,
              balance: 500000n,
              isActive: true,
              type: PrismaWalletType.PERSONAL,
            });
          }
          if (id === systemWalletId.value) {
            return Promise.resolve({
              id: systemWalletId.value,
              balance: 50000n,
              isActive: true,
              type: PrismaWalletType.SYSTEM,
            });
          }
          // Merchant is SUSPENDED -> lockedReceiver returns null
          return Promise.resolve(null);
        },
      );

      try {
        await service.payment(
          customerUserId,
          {
            amountMinorUnits: '15000',
            merchantPhone: '+8801744444444',
            invoiceNumber: 'INV-1001',
            reference: 'Store purchase',
          },
          '00000000-0000-0000-0000-000000000005',
        );
        fail('Expected ForbiddenException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        const body = forbidden.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');
      }

      expect(txMock.transaction.create).not.toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
      expect(txMock.wallet.update).not.toHaveBeenCalled();
    });

    it('should defend against inconsistent database state and abort Payment when merchant is suspended even if merchant wallet is active', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(customerWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        merchantWalletId,
      );

      // Inconsistent state: Merchant wallet isActive is TRUE, so pre-flight passes!
      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(customerWalletId)) {
            return Promise.resolve({
              id: id.value,
              type: WalletType.PERSONAL,
              balance: 500000n,
              currency: Currency.BDT,
            });
          }
          // Merchant wallet is marked active
          return Promise.resolve({
            id: id.value,
            type: WalletType.MERCHANT,
            balance: 300000n,
            currency: Currency.BDT,
          });
        },
      );

      // Inside executeACIDTransfer, after FOR NO KEY UPDATE locking:
      // lockedReceiver queries { where: { id: merchantWalletId.value, isActive: true, user: { status: ACTIVE } } }
      // Because Merchant.status is SUSPENDED, Prisma returns null!
      txMock.wallet.findUnique.mockImplementation(
        (
          args: Prisma.WalletFindUniqueArgs,
        ): Promise<MockLockedWallet | null> => {
          const id = args.where.id;
          if (id === customerWalletId.value) {
            return Promise.resolve({
              id: customerWalletId.value,
              balance: 50000n,
              isActive: true,
              type: PrismaWalletType.PERSONAL,
            });
          }
          if (id === systemWalletId.value) {
            return Promise.resolve({
              id: systemWalletId.value,
              balance: 50000n,
              isActive: true,
              type: PrismaWalletType.SYSTEM,
            });
          }
          // Post-lock check rejects because User.status is SUSPENDED, despite wallet.isActive=true
          return Promise.resolve(null);
        },
      );

      try {
        await service.payment(
          customerUserId,
          {
            amountMinorUnits: '15000',
            merchantPhone: '+8801744444444',
            invoiceNumber: 'INV-1002',
            reference: 'Dining',
          },
          '00000000-0000-0000-0000-000000000006',
        );
        fail('Expected ForbiddenException to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        const body = forbidden.getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('TRANSACTION_PARTICIPANT_RESTRICTED');
        expect(body.message).toBe(
          'One or more transaction participants are restricted.',
        );
      }

      // Crucial proof: Post-lock check halted execution BEFORE any ledger or wallet update was attempted
      expect(txMock.transaction.create).not.toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
      expect(txMock.wallet.update).not.toHaveBeenCalled();
    });

    it('should execute transfer, debit/credit balances, and record double-entry ledgers when both participants are active', async () => {
      walletsServiceMock.getOwnWalletId.mockResolvedValueOnce(customerWalletId);
      walletsServiceMock.resolveWalletIdByPhone.mockResolvedValueOnce(
        merchantWalletId,
      );

      walletsServiceMock.getWalletStateForTransaction.mockImplementation(
        (id: WalletId): Promise<WalletStateForTransaction> => {
          if (id.equals(customerWalletId)) {
            return Promise.resolve({
              id: id.value,
              type: WalletType.PERSONAL,
              balance: 500000n,
              currency: Currency.BDT,
            });
          }
          return Promise.resolve({
            id: id.value,
            type: WalletType.MERCHANT,
            balance: 300000n,
            currency: Currency.BDT,
          });
        },
      );

      txMock.wallet.findUnique.mockImplementation(
        (
          args: Prisma.WalletFindUniqueArgs,
        ): Promise<MockLockedWallet | null> => {
          const id = args.where.id;
          if (id === customerWalletId.value) {
            return Promise.resolve({
              id: customerWalletId.value,
              balance: 500000n,
              isActive: true,
              type: PrismaWalletType.PERSONAL,
            });
          }
          if (id === merchantWalletId.value) {
            return Promise.resolve({
              id: merchantWalletId.value,
              balance: 300000n,
              isActive: true,
              type: PrismaWalletType.MERCHANT,
            });
          }
          if (id === systemWalletId.value) {
            return Promise.resolve({
              id: systemWalletId.value,
              balance: 50000n,
              isActive: true,
              type: PrismaWalletType.SYSTEM,
            });
          }
          return Promise.resolve(null);
        },
      );

      const now = new Date();
      txMock.transaction.create.mockResolvedValueOnce({
        id: 'trx-123',
        trxId: 'TX1234567890',
        createdAT: now,
        type: 'PAYMENT',
        status: 'COMPLETED',
      });

      txMock.wallet.update.mockImplementation(
        (args: Prisma.WalletUpdateArgs): Promise<MockLockedWallet> => {
          const id = args.where.id;
          if (id === customerWalletId.value) {
            return Promise.resolve({
              id: customerWalletId.value,
              balance: 485000n,
              isActive: true,
              type: PrismaWalletType.PERSONAL,
            });
          }
          return Promise.resolve({
            id: merchantWalletId.value,
            balance: 315000n,
            isActive: true,
            type: PrismaWalletType.MERCHANT,
          });
        },
      );

      txMock.ledgerEntry.create.mockResolvedValue({ id: 'le-1' });

      const result = await service.payment(
        customerUserId,
        {
          amountMinorUnits: '15000',
          merchantPhone: '+8801744444444',
          invoiceNumber: 'INV-1003',
          reference: 'Store goods',
        },
        '00000000-0000-0000-0000-000000000007',
      );

      expect(result.trxId).toBe('TX1234567890');
      expect(result.amount).toBe('15000');
      expect(result.newBalance).toBe('485000');
      expect(txMock.transaction.create).toHaveBeenCalled();
      expect(txMock.ledgerEntry.create).toHaveBeenCalledTimes(2); // debit and credit
      expect(txMock.wallet.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('TransactionsService — Startup System Wallet Validation (onModuleInit)', () => {
    it('should reject initialization when system wallet query returns an empty array', async () => {
      prismaMock.wallet.findMany.mockResolvedValueOnce([]);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Expected exactly one SYSTEM wallet, found 0.',
      );
    });

    it('should succeed initialization when system wallet query returns exactly one valid active BDT record with no owner', async () => {
      prismaMock.wallet.findMany.mockResolvedValueOnce([
        {
          id: systemWalletId.value,
          userId: null,
          currency: 'BDT',
          isActive: true,
        },
      ]);

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('should reject initialization when system wallet query returns multiple records', async () => {
      prismaMock.wallet.findMany.mockResolvedValueOnce([
        {
          id: '00000000-0000-4000-8000-000000000001',
          userId: null,
          currency: 'BDT',
          isActive: true,
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          userId: null,
          currency: 'BDT',
          isActive: true,
        },
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Expected exactly one SYSTEM wallet, found 2.',
      );
    });

    it('should reject initialization when system wallet has non-BDT currency USD', async () => {
      prismaMock.wallet.findMany.mockResolvedValueOnce([
        {
          id: systemWalletId.value,
          userId: null,
          currency: 'USD',
          isActive: true,
        },
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        'SYSTEM wallet has invalid ownership, currency, or activity state.',
      );
    });

    it('should reject initialization when system wallet is inactive', async () => {
      prismaMock.wallet.findMany.mockResolvedValueOnce([
        {
          id: systemWalletId.value,
          userId: null,
          currency: 'BDT',
          isActive: false,
        },
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        'SYSTEM wallet has invalid ownership, currency, or activity state.',
      );
    });

    it('should reject initialization when system wallet has a non-null userId owner', async () => {
      prismaMock.wallet.findMany.mockResolvedValueOnce([
        {
          id: systemWalletId.value,
          userId: customerUserId.value,
          currency: 'BDT',
          isActive: true,
        },
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        'SYSTEM wallet has invalid ownership, currency, or activity state.',
      );
    });
  });
});
