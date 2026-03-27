import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { WalletsService } from '../wallets/wallets.service';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { InitiateTransactionDto } from './dto/initiate-transaction.dto';
import { TransactionResultResponse } from './interfaces/transaction-interface';
import { calculateFee } from 'src/common/utils/fee-calculator.util';
import { Prisma } from 'generated/prisma/client';
import { generateTrxId } from 'src/common/utils/trx-generator.util';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly idempotency_TTL: ms.StringValue;
  private readonly processing_TTL: ms.StringValue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
  ) {
    this.idempotency_TTL = configService.getOrThrow<ms.StringValue>(
      'IDEMPOTENCY_TTL_SECONDS',
    );
    this.processing_TTL = configService.getOrThrow<ms.StringValue>(
      'PROCESSING_TTL_SECONDS',
    );
  }

  private async executeACIDTransfer(
    senderId: string,
    dto: InitiateTransactionDto,
  ): Promise<TransactionResultResponse> {
    const { idempotencyKey, ammount, receiverId, type, reference } = dto;

    //==========================================================
    // ATOMIC IDEMPOTECNY CHECK (REDIS)
    //==========================================================
    const redisKey = `idempotency:trx:${idempotencyKey}`;

    //Fails if key is already exists.
    //Short TTL to protect duplicate processing
    const isFirstAttempt = await this.redisService.set(redisKey, 'PROCESSING', {
      ttl: ms(this.processing_TTL) / 1000,
      nx: true,
    });

    if (!isFirstAttempt) {
      this.logger.warn(
        `Duplicate transaction intent blocked:${idempotencyKey}`,
      );
      throw new ConflictException(
        'This transaction is already procession or completed',
      );
    }

    //==========================================================
    // BUSINESS LOGIC & STATE VALIDATION
    //==========================================================
    if (senderId === receiverId) {
      await this.redisService.del(redisKey);
      throw new BadRequestException(`Can not do transaction to own account`);
    }

    try {
      const [senderWallet, receiverWallet] = await Promise.all([
        this.walletsService.getWalletById(senderId),
        this.walletsService.getWalletById(receiverId),
      ]);

      if (!senderWallet || !receiverWallet) {
        throw new BadRequestException('One of the wallet is frozen');
      }

      const systemWallet = await this.prisma.wallet.findFirst({
        where: { type: 'SYSTEM' },
      });
      if (!systemWallet) {
        throw new InternalServerErrorException(
          'Critical: System Revenue wallet is missing',
        );
      }

      //==========================================================
      // MATH VALIDATION
      //==========================================================
      const transferAmount = BigInt(ammount);
      const feeAmount = calculateFee(transferAmount, type);
      const totalRequiredAmount = transferAmount + feeAmount;

      if (senderWallet.balance < totalRequiredAmount) {
        throw new BadRequestException('Insufficient funds');
      }

      //==========================================================
      // THE PIRSMA TRANSACTION (THE ACID BLOCK)
      //==========================================================

      const result = await this.prisma.$transaction(async (tsx) => {
        // -----------------------------------------------------------------
        // 1. DEADLOCK PREVENTION & PESSIMISTIC LOCKING
        // -----------------------------------------------------------------
        const walletsToLock = [senderId, receiverId, systemWallet.id].sort();

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
          where: { id: systemWallet.id },
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
        // 3. THE MATMETICAL MUTATIONS
        // -----------------------------------------------------------------
        const newSenderBalance = lockedSender.balance - totalRequiredAmount;
        const newReceiverBalance = lockedReceiver.balance + transferAmount;
        const newSystemBalance = lockedSystem.balance + feeAmount;

        // -----------------------------------------------------------------
        // 4. WRITE IN THE TRANSACTION TABLE
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
        // 5. DOUBLE-ENTRY LEDGER & WALLET UPDATES
        // -----------------------------------------------------------------
        await Promise.all([
          tsx.wallet.update({
            where: { id: senderId },
            data: { balance: newSenderBalance },
          }),

          tsx.wallet.update({
            where: { id: receiverId },
            data: { balance: newReceiverBalance },
          }),

          ...(feeAmount > 0n
            ? [
                tsx.wallet.update({
                  where: { id: systemWallet.id },
                  data: { balance: newSystemBalance },
                }),
              ]
            : []),

          //Entry 1: Sender
          tsx.ledgerEntry.create({
            data: {
              transactionId: transactionRecord.id,
              walletId: senderId,
              type: 'DEBIT',
              amount: totalRequiredAmount,
              balanceAfter: newSenderBalance,
              description: `Sent Money to ${receiverId}`,
            },
          }),

          //Entry 2: Receiver
          tsx.ledgerEntry.create({
            data: {
              transactionId: transactionRecord.id,
              walletId: receiverId,
              type: 'CREDIT',
              amount: transferAmount,
              balanceAfter: newReceiverBalance,
              description: `Money received from ${senderId}`,
            },
          }),

          //Entry 3: System
          ...(feeAmount > 0n
            ? [
                tsx.ledgerEntry.create({
                  data: {
                    transactionId: transactionRecord.id,
                    walletId: systemWallet.id,
                    type: 'CREDIT',
                    amount: feeAmount,
                    balanceAfter: newSystemBalance,
                    description: `Fee collection for TRX ${transactionRecord.trxId}`,
                  },
                }),
              ]
            : []),
        ]);

        return {
          trxId: transactionRecord.trxId,
          type: transactionRecord.type,
          amount: transferAmount.toString(),
          fee: feeAmount.toString(),
          status: transactionRecord.status,
          createdAt: transactionRecord.createdAT,
          newBalance: newSenderBalance.toString(),
        };
      });

      //A permanent 24-hour COMPLETED lock
      await this.redisService.set(redisKey, result.trxId, {
        ttl: ms(this.idempotency_TTL) / 1000,
      });

      return result;
    } catch (error) {
      await this.redisService.del(redisKey);
      throw error;
    }
  }
}
