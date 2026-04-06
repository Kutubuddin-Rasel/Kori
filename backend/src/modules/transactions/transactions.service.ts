import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  TransactionResultResponse,
  TransactionValidationResponse,
} from './interfaces/transaction-response.interface';
import { calculateFee } from 'src/common/utils/fee-calculator.util';
import { Prisma, TransactionType, WalletType } from 'generated/prisma/client';
import { generateTrxId } from 'src/common/utils/trx-generator.util';
import { SendMoneyDto } from './dto/send-money.dto';
import { CashInDto } from './dto/cash-in.dto';
import { CashOutDto } from './dto/cash-out.dto';
import { PaymentDto } from './dto/payment.dto';

@Injectable()
export class TransactionsService implements OnModuleInit {
  private readonly logger = new Logger(TransactionsService.name);
  private cachedSystemWalletId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly walletsService: WalletsService,
  ) {}

  async onModuleInit() {
    try {
      const systemWallet = await this.prisma.wallet.findFirst({
        where: { type: 'SYSTEM' },
        select: { id: true },
      });
      if (!systemWallet) {
        throw new InternalServerErrorException(
          'Critical System Revenue Wallet is missing from the database.',
        );
      }
      this.cachedSystemWalletId = systemWallet.id;
    } catch (error) {
      this.logger.error('Failed to load system wallet', error);
      throw error;
    }
  }

  async sendMoney(
    senderId: string,
    dto: SendMoneyDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, receiverId, reference } = dto;

    const math = await this.validateAndPrepareTransfer(
      senderId,
      receiverId,
      amount,
      TransactionType.SEND_MONEY,
      WalletType.PERSONAL,
      WalletType.PERSONAL,
    );

    return this.executeACIDTransfer(
      senderId,
      receiverId,
      this.cachedSystemWalletId,
      math.transferAmount,
      math.totalRequiredAmount,
      math.feeAmount,
      TransactionType.SEND_MONEY,
      idempotencyKey,
      reference,
    );
  }

  async cashIn(
    agentId: string,
    dto: CashInDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, receiverId, reference } = dto;

    const math = await this.validateAndPrepareTransfer(
      agentId,
      receiverId,
      amount,
      TransactionType.CASH_IN,
      WalletType.AGENT,
      WalletType.PERSONAL,
    );

    return this.executeACIDTransfer(
      agentId,
      receiverId,
      this.cachedSystemWalletId,
      math.transferAmount,
      math.totalRequiredAmount,
      math.feeAmount,
      TransactionType.CASH_IN,
      idempotencyKey,
      reference,
    );
  }

  async cashOut(
    userId: string,
    dto: CashOutDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, agentId, reference } = dto;
    const math = await this.validateAndPrepareTransfer(
      userId,
      agentId,
      amount,
      TransactionType.CASH_OUT,
      WalletType.PERSONAL,
      WalletType.AGENT,
    );

    return this.executeACIDTransfer(
      userId,
      agentId,
      this.cachedSystemWalletId,
      math.transferAmount,
      math.totalRequiredAmount,
      math.feeAmount,
      TransactionType.CASH_OUT,
      idempotencyKey,
      reference,
    );
  }

  async payment(
    userId: string,
    dto: PaymentDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, merchantId, invoiceNumber } = dto;

    const math = await this.validateAndPrepareTransfer(
      userId,
      merchantId,
      amount,
      TransactionType.PAYMENT,
      WalletType.PERSONAL,
      WalletType.AGENT,
    );

    return this.executeACIDTransfer(
      userId,
      merchantId,
      this.cachedSystemWalletId,
      math.transferAmount,
      math.totalRequiredAmount,
      math.feeAmount,
      TransactionType.PAYMENT,
      idempotencyKey,
      invoiceNumber,
    );
  }

  private async validateAndPrepareTransfer(
    senderId: string,
    receiverId: string,
    amount: string,
    type: TransactionType,
    expectedSenderType: WalletType,
    expectedReceiverType: WalletType,
  ): Promise<TransactionValidationResponse> {
    // Check if sender and receiver are the same
    if (senderId === receiverId) {
      throw new BadRequestException(`Can not do transaction to own account`);
    }

    // Check if system wallet is available
    if (!this.cachedSystemWalletId) {
      throw new InternalServerErrorException(
        'Critical System Revenue Wallet is missing from the database.',
      );
    }

    // Fetch wallets state
    const [senderWallet, receiverWallet] = await Promise.all([
      this.walletsService.getWalletStateForTransaction(senderId),
      this.walletsService.getWalletStateForTransaction(receiverId),
    ]);

    // Check if sender wallet type is valid
    if (senderWallet.type !== expectedSenderType) {
      throw new BadRequestException(
        `Unauthorized: Sender wallet must be of type ${expectedSenderType}.`,
      );
    }

    // Check if receiver wallet type is valid
    if (receiverWallet.type !== expectedReceiverType) {
      throw new BadRequestException(
        `Unauthorized: Receiver wallet must be of type ${expectedReceiverType}.`,
      );
    }

    // Calculate fee and total required amount
    const transferAmount = BigInt(amount);
    const feeAmount = calculateFee(transferAmount, type);
    const totalRequiredAmount = transferAmount + feeAmount;

    // Check if sender has sufficient funds
    if (senderWallet.balance < totalRequiredAmount) {
      throw new BadRequestException('Insufficient funds');
    }

    return {
      transferAmount,
      feeAmount,
      totalRequiredAmount,
    };
  }

  private async executeACIDTransfer(
    senderId: string,
    receiverId: string,
    systemWalletId: string,
    transferAmount: bigint,
    totalRequiredAmount: bigint,
    feeAmount: bigint,
    type: TransactionType,
    idempotencyKey: string,
    reference?: string,
  ): Promise<TransactionResultResponse> {
    //==========================================================
    // THE PIRSMA TRANSACTION (THE ACID BLOCK)
    //==========================================================
    try {
      const result = await this.prisma.$transaction(async (tsx) => {
        // -----------------------------------------------------------------
        // 1. DEADLOCK PREVENTION & PESSIMISTIC LOCKING
        // -----------------------------------------------------------------
        const walletsToLock = [senderId, receiverId, systemWalletId].sort();

        await tsx.$queryRaw(
          Prisma.sql`SELECT id FROM wallets WHERE id IN(${Prisma.join(walletsToLock)}) FOR NO KEY UPDATE`,
        );

        // -----------------------------------------------------------------
        // 2. RE-FETCH FRESH STATE
        // -----------------------------------------------------------------
        const lockedSender = await tsx.wallet.findUnique({
          where: { id: senderId },
        });
        const lockedReceiver = await tsx.wallet.findUnique({
          where: { id: receiverId },
        });
        const lockedSystem = await tsx.wallet.findUnique({
          where: { id: systemWalletId },
        });

        if (!lockedSender || !lockedReceiver || !lockedSystem) {
          throw new InternalServerErrorException(
            'A required wallet vanished during lock acquis',
          );
        }

        if (lockedSender.balance < totalRequiredAmount) {
          throw new BadRequestException('Insufficient funds');
        }

        // -----------------------------------------------------------------
        // 3. WRITE IN THE TRANSACTION TABLE
        // -----------------------------------------------------------------
        const trxId = generateTrxId();
        const transactionRecord = await tsx.transaction.create({
          data: {
            trxId,
            idempotencyKey,
            type,
            status: 'COMPLETED',
            amount: transferAmount,
            fee: feeAmount,
            reference,
            senderWalletId: senderId,
            receiverWalletId: receiverId,
          },
        });

        // -----------------------------------------------------------------
        // 4. DOUBLE-ENTRY LEDGER & WALLET UPDATES
        // -----------------------------------------------------------------

        // Update Sender (Atomic Decrement)
        const updatedSender = await tsx.wallet.update({
          where: { id: senderId },
          data: { balance: { decrement: totalRequiredAmount } },
        });

        await tsx.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            walletId: senderId,
            type: 'DEBIT',
            amount: totalRequiredAmount,
            balanceAfter: updatedSender.balance,
            description: `Sent Money to ${receiverId}`,
          },
        });

        // Update Receiver (Atomic increment)
        const updatedReceiver = await tsx.wallet.update({
          where: { id: receiverId },
          data: { balance: { increment: transferAmount } },
        });

        await tsx.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            walletId: receiverId,
            type: 'CREDIT',
            amount: transferAmount,
            balanceAfter: updatedReceiver.balance,
            description: `Money received from ${senderId}`,
          },
        });

        // TODO (Performance) : Extract System Wallet update to a batched async chronometer to prevent Hot Row connection at extreme scale
        // Update System Revenue (If Fee exists)
        if (feeAmount > 0n) {
          const updatedSystem = await tsx.wallet.update({
            where: { id: systemWalletId },
            data: { balance: { increment: feeAmount } },
          });

          await tsx.ledgerEntry.create({
            data: {
              transactionId: transactionRecord.id,
              walletId: systemWalletId,
              type: 'CREDIT',
              amount: feeAmount,
              balanceAfter: updatedSystem.balance,
              description: `Fee collection for TRX ${transactionRecord.trxId}`,
            },
          });
        }

        return {
          trxId: transactionRecord.trxId,
          type: transactionRecord.type,
          amount: transferAmount.toString(),
          fee: feeAmount.toString(),
          status: transactionRecord.status,
          createdAt: transactionRecord.createdAT,
          newBalance: updatedSender.balance.toString(),
        };
      });

      return result;
    } catch (error) {
      // Prisma P2002 = Unique Constraint Voilation
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This Transaction was already securely possesed by the database',
        );
      }

      throw error;
    }
  }
}
