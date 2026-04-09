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
import { AddMoneyDto } from './dto/add-money.dto';
import { DynamicLedgerDescripton } from 'src/common/utils/dynamic-ledger-description.util';

/**
 * TransactionsService is responsible for handling all financial transactions in the system, including:
 * - Validating transaction requests based on business rules and wallet types
 * - Calculating fees and total required amounts for transactions
 * - Executing transactions within ACID-compliant Prisma transactions to ensure data integrity
 * - Implementing deadlock prevention strategies through consistent locking order
 * - Handling idempotency to prevent duplicate transactions in case of retries
 * - Logging and error handling for robust transaction processing
 *
 * The service uses a cached system wallet ID for fee collection, which is loaded on module initialization.
 * It interacts with the WalletsService to fetch wallet states and with the PrismaService to perform database operations.
 * Each transaction type (Send Money, Cash In, Cash Out, Payment, Add Money) has specific validation rules and fee structures.
 * The service ensures that all transactions adhere to these rules and that the system remains consistent even under high concurrency.
 */
@Injectable()
export class TransactionsService implements OnModuleInit {
  private readonly logger = new Logger(TransactionsService.name);
  // Cache the System Wallet ID on module initialization for performance and reliability
  private cachedSystemWalletId!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly walletsService: WalletsService,
  ) {}

  async onModuleInit() {
    try {
      // Load and cache the System Wallet ID on startup
      const systemWallet = await this.prisma.wallet.findFirst({
        where: { type: 'SYSTEM' },
        select: { id: true },
      });

      // Critical check to ensure the system wallet exists before processing any transactions
      if (!systemWallet) {
        throw new InternalServerErrorException(
          'Critical System Revenue Wallet is missing from the database.',
        );
      }
      // Cache the System Wallet ID for fast access during transactions
      this.cachedSystemWalletId = systemWallet.id;
    } catch (error) {
      this.logger.error('Failed to load system wallet', error);
      throw error;
    }
  }

  /**
   * Strict Rule : The Sender must be a personal wallet. The Receiver can be any wallet type.
   * This endpoint allows users to send money to other users. It validates the transaction based on business rules, calculates fees, and executes the transfer within an ACID-compliant transaction block to ensure data integrity.
   * The idempotency key is used to prevent duplicate transactions in case of retries, and it must be unique for each transaction attempt.
   * The reference field can be used to store any additional information about the transaction, such as a note or an external reference ID.
   */
  async sendMoney(
    senderId: string,
    dto: SendMoneyDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, receiverId, reference } = dto;

    // Validate the transaction request and prepare the necessary calculations for fees and total required amount
    const math = await this.validateAndPrepareTransfer(
      senderId,
      receiverId,
      amount,
      TransactionType.SEND_MONEY,
      WalletType.PERSONAL,
      WalletType.PERSONAL,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
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

  /*
   * Strict Rule : The Sender must be an agent wallet. The Receiver must be a personal wallet.
   * This endpoint allows agents to cash in money to users' personal wallets. It validates the transaction based on business rules, calculates fees, and executes the transfer within an ACID-compliant transaction block to ensure data integrity.
   * The idempotency key is used to prevent duplicate transactions in case of retries, and it must be unique for each transaction attempt.
   * The reference field can be used to store any additional information about the transaction, such as a note or an external reference ID.
   */
  async cashIn(
    agentId: string,
    dto: CashInDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, receiverId, reference } = dto;
    // Validate the transaction request and prepare the necessary calculations for fees and total required amount
    const math = await this.validateAndPrepareTransfer(
      agentId,
      receiverId,
      amount,
      TransactionType.CASH_IN,
      WalletType.AGENT,
      WalletType.PERSONAL,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
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

  /*
   * Strict Rule : The Sender must be a personal wallet. The Receiver must be an agent wallet.
   * This endpoint allows users to cash out money from their personal wallets to agents. It validates the transaction based on business rules, calculates fees, and executes the transfer within an ACID-compliant transaction block to ensure data integrity.
   * The idempotency key is used to prevent duplicate transactions in case of retries, and it must be unique for each transaction attempt.
   * The reference field can be used to store any additional information about the transaction, such as a note or an external reference ID.
   */
  async cashOut(
    userId: string,
    dto: CashOutDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, agentId, reference } = dto;

    // Validate the transaction request and prepare the necessary calculations for fees and total required amount
    const math = await this.validateAndPrepareTransfer(
      userId,
      agentId,
      amount,
      TransactionType.CASH_OUT,
      WalletType.PERSONAL,
      WalletType.AGENT,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
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

  /*
   * Strict Rule : The Sender is the System Wallet. The Receiver must be a merchant wallet.
   * This endpoint allows users to make payments to merchants. It validates the transaction based on business rules, calculates fees, and executes the transfer within an ACID-compliant transaction block to ensure data integrity.
   * The idempotency key is used to prevent duplicate transactions in case of retries, and it must be unique for each transaction attempt.
   * The reference field can be used to store any additional information about the transaction, such as a note or an external reference ID.
   */
  async payment(
    userId: string,
    dto: PaymentDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, merchantId, invoiceNumber, reference } = dto;

    // Validate the transaction request and prepare the necessary calculations for fees and total required amount
    const math = await this.validateAndPrepareTransfer(
      userId,
      merchantId,
      amount,
      TransactionType.PAYMENT,
      WalletType.PERSONAL,
      WalletType.MERCHANT,
    );
    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      userId,
      merchantId,
      this.cachedSystemWalletId,
      math.transferAmount,
      math.totalRequiredAmount,
      math.feeAmount,
      TransactionType.PAYMENT,
      idempotencyKey,
      reference || invoiceNumber,
    );
  }

  /*
  * Strict Rule : The Sender is the System Wallet. The Receiver must be personal
  * This endpoint allows users to add money to their personal wallets through external bank gateways. 
  * It validates the transaction based on business rules, calculates fees, and executes the transfer within an ACID-compliant transaction block to ensure data integrity.
  * TODO (Architectural Roadmap):
    1. This endpoint should eventually be converted to a Weebhook Receiver from Payment Gateway
    2. It should only be triggerd by external providers (e.g. Stripe, SSLCommerz, etc)
    3. Integrate a Velocity/Limits module here to enforce Daily/Monthly AML(Anti-Money Laundering) constraints
    4. The Idempotency key must map directly to the Bank's external EventID to prevent duplicate transactions
  */
  async addMoney(
    userId: string,
    dto: AddMoneyDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amount, bankGatewayToken, reference } = dto;

    // Validate the transaction request and prepare the necessary calculations for fees and total required amount
    const math = await this.validateAndPrepareTransfer(
      this.cachedSystemWalletId,
      userId,
      amount,
      TransactionType.ADD_MONEY,
      WalletType.SYSTEM,
      WalletType.PERSONAL,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      this.cachedSystemWalletId,
      userId,
      this.cachedSystemWalletId,
      math.transferAmount,
      math.totalRequiredAmount,
      math.feeAmount,
      TransactionType.ADD_MONEY,
      idempotencyKey,
      reference || bankGatewayToken,
    );
  }

  /**
   * Validates the transaction request and prepares the necessary calculations for fees and total required amount
   * This method checks for:
   * - Validity of sender and receiver wallet types based on the transaction type
   * - Sufficient funds in the sender's wallet to cover the transfer amount and fees
   * - Ensures that the sender and receiver are not the same to prevent self-transfers
   * - Calculates the fee based on the transaction type and returns the transfer amount, fee amount, and total required amount for the transaction
   * - Throws appropriate exceptions if any validation fails, such as insufficient funds, invalid wallet types, or missing system wallet
   */
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

  /**
   * Executes the ACID transfer transaction using Prisma's transaction API. This method ensures that all operations within the transaction block are atomic, consistent, isolated, and durable.
   * It implements deadlock prevention by acquiring locks on the involved wallets in a consistent order based on their IDs. This prevents circular wait conditions that can lead to deadlocks.
   * The method also re-fetches the locked wallets to get their most up-to-date state after acquiring locks, ensuring that the transaction operates on the latest data and preventing issues with concurrent transactions.
   * It validates that the sender still has sufficient funds after acquiring locks to prevent issues with concurrent transactions that may have modified the sender's balance before the locks were acquired.
   * The method creates a transaction record in the database, updates the sender's and receiver's wallet balances, and creates corresponding ledger entries for each operation. If there is a fee involved, it also updates the system wallet balance and creates a ledger entry for fee collection.
   * Finally, it returns a structured response containing transaction details such as transaction ID, type, amount, fee, status, creation time, and new balance.
  
   * The method performs the following steps:
   * 1. Acquires locks on the sender, receiver, and system wallets in a consistent order to prevent deadlocks.
   * 2. Re-fetches the locked wallets to get their most up-to-date state after acquiring locks.
   * 3. Validates that the sender still has sufficient funds after acquiring locks to prevent issues with concurrent transactions.
   * 4. Creates a transaction record in the database with the status set to 'COMPLETED'.
   * 5. Updates the sender's wallet balance by decrementing the total required amount (transfer amount + fee) and creates a corresponding ledger entry.
   * 6. Updates the receiver's wallet balance by incrementing the transfer amount and creates a corresponding ledger entry.
   * 7. If there is a fee, updates the system wallet balance by incrementing the fee amount and creates a corresponding ledger entry for fee collection.
   * 8. Returns a structured response containing transaction details such as transaction ID, type, amount, fee, status, creation time, and new balance.
   * The new balance returned is determined based on whether the sender or receiver is the system wallet to ensure accurate reporting of the user's balance after the transaction.
   */
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

        // To prevent deadlocks, we acquire locks on the involved wallets in a consistent order based on their IDs
        const walletsToLock = [senderId, receiverId, systemWalletId].sort();

        // Acquire locks on the wallets using a raw SQL query with "FOR NO KEY UPDATE" to prevent other transactions from modifying these rows until the current transaction is complete
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

        // Critical check to ensure all wallets are still present after acquiring locks
        if (!lockedSender || !lockedReceiver || !lockedSystem) {
          throw new InternalServerErrorException(
            'A required wallet vanished during lock acquis',
          );
        }

        // Check if sender has sufficient funds after acquiring locks to prevent issues with concurrent transactions that may have modified the sender's balance before locks were acquired
        if (lockedSender.balance < totalRequiredAmount) {
          throw new BadRequestException('Insufficient funds');
        }

        // -----------------------------------------------------------------
        // 3. WRITE IN THE TRANSACTION TABLE
        // -----------------------------------------------------------------

        // Create a transaction record in the database with the status set to 'COMPLETED'. The idempotency key is used to prevent duplicate transactions in case of retries, and the reference field can store any additional information about the transaction.
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
        // Get dynamic ledger description based on transaction type and involved parties to enhance the clarity of ledger entries for auditing and user transaction history purposes
        const { debitDescription, creditDescription } = DynamicLedgerDescripton(
          type,
          senderId,
          receiverId,
        );

        // Update Sender (Atomic Decrement) - The sender's wallet balance is decremented by the total required amount (transfer amount + fee), and a corresponding ledger entry is created to reflect the debit.
        const updatedSender = await tsx.wallet.update({
          where: { id: senderId },
          data: { balance: { decrement: totalRequiredAmount } },
        });

        // Create ledger entry for sender's debit transaction. This entry provides a clear record of the amount debited from the sender's wallet, the resulting balance after the transaction, and a description for auditing and user transaction history purposes.
        await tsx.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            walletId: senderId,
            type: 'DEBIT',
            amount: totalRequiredAmount,
            balanceAfter: updatedSender.balance,
            description: debitDescription,
          },
        });

        // Update Receiver (Atomic increment) - The receiver's wallet balance is incremented by the transfer amount, and a corresponding ledger entry is created to reflect the credit.
        const updatedReceiver = await tsx.wallet.update({
          where: { id: receiverId },
          data: { balance: { increment: transferAmount } },
        });

        // Create ledger entry for receiver's credit transaction. This entry provides a clear record of the amount credited to the receiver's wallet, the resulting balance after the transaction, and a description for auditing and user transaction history purposes.
        await tsx.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            walletId: receiverId,
            type: 'CREDIT',
            amount: transferAmount,
            balanceAfter: updatedReceiver.balance,
            description: creditDescription,
          },
        });

        // TODO (Performance) : Extract System Wallet update to a batched async chronometer to prevent Hot Row connection at extreme scale
        // Update System Revenue (If Fee exists) - If there is a fee involved in the transaction, the system wallet balance is incremented by the fee amount
        if (feeAmount > 0n) {
          const updatedSystem = await tsx.wallet.update({
            where: { id: systemWalletId },
            data: { balance: { increment: feeAmount } },
          });

          // Create ledger entry for system wallet's credit transaction to record the fee collection. This entry provides a clear record of the fee amount credited to the system wallet, the resulting balance after the transaction, and a description for auditing and financial reporting purposes.
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

        // -----------------------------------------------------------------
        // 5. STRUCTURED RESPONSE
        // -----------------------------------------------------------------
        /**
         * Return a structured response containing transaction details such as transaction ID, type, amount, fee, status, creation time, and new balance. The new balance is determined based on whether the sender or receiver is the system wallet to ensure accurate reporting of the user's balance after the transaction.
          - If the sender is the system wallet, the new balance returned will be the updated balance of the receiver's wallet, as this reflects the user's balance after receiving funds.
          - If the sender is not the system wallet, the new balance returned will be the updated balance of the sender's wallet, as this reflects the user's balance after sending funds.
         * This approach ensures that users receive accurate information about their balance changes resulting from the transaction, regardless of whether they are sending or receiving funds. 
         */
        return {
          trxId: transactionRecord.trxId,
          type: transactionRecord.type,
          amount: transferAmount.toString(),
          fee: feeAmount.toString(),
          status: transactionRecord.status,
          createdAt: transactionRecord.createdAT,
          newBalance:
            senderId === this.cachedSystemWalletId
              ? updatedReceiver.balance.toString()
              : updatedSender.balance.toString(),
        };
      });

      return result;
    } catch (error) {
      /**
       * Error Handling:
       * The method handles specific Prisma errors such as unique constraint violations (P2002) to ensure idempotency and prevent duplicate transactions in case of retries. If a transaction with the same idempotency key already exists, it throws a ConflictException indicating that the transaction was already processed.
       * Any other errors encountered during the transaction will be propagated up to be handled by the calling method or global exception filters, ensuring that unexpected issues are not silently swallowed and can be properly logged and addressed.
       */
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
