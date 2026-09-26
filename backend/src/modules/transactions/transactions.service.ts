import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  TransactionResultResponse,
  TransactionAmounts,
} from './interfaces/transaction-response.interface';
import { calculateFee } from 'src/common/utils/fee-calculator.util';
import { Prisma, WalletType } from 'generated/prisma/client';
import { TransactionType } from 'src/domain/enums';
import { generateTrxId } from 'src/common/utils/trx-generator.util';
import { SendMoneyDto } from './dto/send-money.dto';
import { CashInDto } from './dto/cash-in.dto';
import { CashOutDto } from './dto/cash-out.dto';
import { PaymentDto } from './dto/payment.dto';
import { AddMoneyDto } from './dto/add-money.dto';
import { DynamicLedgerDescription } from 'src/common/utils/dynamic-ledger-description.util';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { WalletId } from 'src/domain/value-objects/wallet-id.vo';
import { PhoneNumber } from 'src/domain/value-objects/phone-number.vo';
import { Money } from 'src/domain/value-objects/money.vo';

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
  private cachedSystemWalletId!: WalletId;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletsService: WalletsService,
  ) {}

  async onModuleInit() {
    try {
      // Load and cache the System Wallet ID on startup
      const systemWallet = await this.prisma.wallet.findFirst({
        where: { type: WalletType.SYSTEM },
        select: { id: true },
      });

      // Critical check to ensure the system wallet exists before processing any transactions
      if (!systemWallet) {
        throw new InternalServerErrorException(
          'Critical System Revenue Wallet is missing from the database.',
        );
      }
      // Cache the System Wallet ID for fast access during transactions
      this.cachedSystemWalletId = WalletId.from(systemWallet.id);
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
    actorUserId: UserId,
    dto: SendMoneyDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amountMinorUnits, recipientPhone, reference } = dto;

    const recipientPhoneNumber = PhoneNumber.from(recipientPhone);

    const [senderWalletId, receiverWalletId] = await Promise.all([
      this.walletsService.getOwnWalletId(actorUserId),
      this.walletsService.resolveWalletIdByPhone(recipientPhoneNumber),
    ]);

    // Calculate the transfer amount, fee amount, and total required amount for the transaction based on the provided amount and transaction type
    const amounts = this.calculateTransferMath(
      amountMinorUnits,
      TransactionType.SEND_MONEY,
    );

    // Validate the transaction request and check for eligibility based on business rules, including wallet types and sufficient funds
    await this.assertTransferEligibility(
      senderWalletId,
      receiverWalletId,
      WalletType.PERSONAL,
      WalletType.PERSONAL,
      amounts.totalRequiredAmount,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      senderWalletId,
      receiverWalletId,
      this.cachedSystemWalletId,
      amounts.transferAmount,
      amounts.totalRequiredAmount,
      amounts.feeAmount,
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
    actorUserId: UserId,
    dto: CashInDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amountMinorUnits, customerPhone, reference } = dto;

    const customerPhoneNumber = PhoneNumber.from(customerPhone);

    const [agentWalletId, receiverWalletId] = await Promise.all([
      this.walletsService.getOwnWalletId(actorUserId),
      this.walletsService.resolveWalletIdByPhone(customerPhoneNumber),
    ]);

    // Calculate the transfer amount, fee amount, and total required amount for the transaction based on the provided amount and transaction type
    const amounts = this.calculateTransferMath(
      amountMinorUnits,
      TransactionType.CASH_IN,
    );

    // Validate the transaction request and check for eligibility based on business rules, including wallet types and sufficient funds
    await this.assertTransferEligibility(
      agentWalletId,
      receiverWalletId,
      WalletType.AGENT,
      WalletType.PERSONAL,
      amounts.totalRequiredAmount,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      agentWalletId,
      receiverWalletId,
      this.cachedSystemWalletId,
      amounts.transferAmount,
      amounts.totalRequiredAmount,
      amounts.feeAmount,
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
    actorUserId: UserId,
    dto: CashOutDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amountMinorUnits, agentPhone, reference } = dto;

    const agentPhoneNumber = PhoneNumber.from(agentPhone);

    const [customerWalletId, agentWalletId] = await Promise.all([
      this.walletsService.getOwnWalletId(actorUserId),
      this.walletsService.resolveWalletIdByPhone(agentPhoneNumber),
    ]);

    // Calculate the transfer amount, fee amount, and total required amount for the transaction based on the provided amount and transaction type
    const amounts = this.calculateTransferMath(
      amountMinorUnits,
      TransactionType.CASH_OUT,
    );

    // Validate the transaction request and check for eligibility based on business rules, including wallet types and sufficient funds
    await this.assertTransferEligibility(
      customerWalletId,
      agentWalletId,
      WalletType.PERSONAL,
      WalletType.AGENT,
      amounts.totalRequiredAmount,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      customerWalletId,
      agentWalletId,
      this.cachedSystemWalletId,
      amounts.transferAmount,
      amounts.totalRequiredAmount,
      amounts.feeAmount,
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
    actorUserId: UserId,
    dto: PaymentDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amountMinorUnits, merchantPhone, invoiceNumber, reference } = dto;

    const merchantPhoneNumber = PhoneNumber.from(merchantPhone);

    const [customerWalletId, merchantWlletId] = await Promise.all([
      this.walletsService.getOwnWalletId(actorUserId),
      this.walletsService.resolveWalletIdByPhone(merchantPhoneNumber),
    ]);

    // Calculate the transfer amount, fee amount, and total required amount for the transaction based on the provided amount and transaction type
    const amounts = this.calculateTransferMath(
      amountMinorUnits,
      TransactionType.PAYMENT,
    );

    // Validate the transaction request and check for eligibility based on business rules, including wallet types and sufficient funds
    await this.assertTransferEligibility(
      customerWalletId,
      merchantWlletId,
      WalletType.PERSONAL,
      WalletType.MERCHANT,
      amounts.totalRequiredAmount,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      customerWalletId,
      merchantWlletId,
      this.cachedSystemWalletId,
      amounts.transferAmount,
      amounts.totalRequiredAmount,
      amounts.feeAmount,
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
    actorUserId: UserId,
    dto: AddMoneyDto,
    idempotencyKey: string,
  ): Promise<TransactionResultResponse> {
    const { amountMinorUnits, bankGatewayToken, reference } = dto;

    const receiverWalletId =
      await this.walletsService.getOwnWalletId(actorUserId);

    // Calculate the transfer amount, fee amount, and total required amount for the transaction based on the provided amount and transaction type
    const amounts = this.calculateTransferMath(
      amountMinorUnits,
      TransactionType.ADD_MONEY,
    );

    // Validate the transaction request and check for eligibility based on business rules, including wallet types and sufficient funds
    await this.assertTransferEligibility(
      this.cachedSystemWalletId,
      receiverWalletId,
      WalletType.SYSTEM,
      WalletType.PERSONAL,
      amounts.totalRequiredAmount,
    );

    // Execute the transaction within an ACID-compliant block to ensure data integrity and consistency
    return this.executeACIDTransfer(
      this.cachedSystemWalletId,
      receiverWalletId,
      this.cachedSystemWalletId,
      amounts.transferAmount,
      amounts.totalRequiredAmount,
      amounts.feeAmount,
      TransactionType.ADD_MONEY,
      idempotencyKey,
      reference || bankGatewayToken,
    );
  }

  /**
   * Validates the transaction request and check for eligibility based on business rules.
   * This method checks for:
   * - Validity of sender and receiver wallet types based on the transaction type
   * - Sufficient funds in the sender's wallet to cover the transfer amount and fees
   * - Ensures that the sender and receiver are not the same to prevent self-transfers
   * - Throws appropriate exceptions if any validation fails, such as insufficient funds, invalid wallet types, or missing system wallet
   * @param senderWalletId - The ID of the wallet initiating the transaction
   * @param receiverWalletId - The ID of the wallet receiving the transaction
   * @param expectedSenderType - The expected type of the sender's wallet
   * @param expectedReceiverType - The expected type of the receiver's wallet
   * @param totalRequiredAmount - The total amount required for the transaction, including fees
   */
  private async assertTransferEligibility(
    senderWalletId: WalletId,
    receiverWalletId: WalletId,
    expectedSenderType: WalletType,
    expectedReceiverType: WalletType,
    totalRequiredAmount: Money,
  ): Promise<void> {
    // Check if sender and receiver are the same
    if (senderWalletId.equals(receiverWalletId)) {
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
      this.walletsService.getWalletStateForTransaction(senderWalletId),
      this.walletsService.getWalletStateForTransaction(receiverWalletId),
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

    const senderBalance = Money.fromMinorUnits(senderWallet.balance);
    // Check if sender has sufficient funds
    if (senderBalance.isLessThan(totalRequiredAmount)) {
      throw new BadRequestException('Insufficient funds');
    }
  }

  /**
   * Calculates the transfer amount, fee amount, and total required amount for a transaction based on the provided amount and transaction type.
   * This method uses the calculateFee utility function to determine the fee based on the transaction type and amount.
   * It returns an object containing the transfer amount, fee amount, and total required amount, which can be used for further validation and processing of the transaction.
   * @param amountMinorUnits - The amount involved in the transaction (as a string)
   * @param type - The type of transaction for which the fee is being calculated
   * @returns - An object containing transferAmount, feeAmount, and totalRequiredAmount as bigints
   */
  private calculateTransferMath(
    amountMinorUnits: string,
    type: TransactionType,
  ): TransactionAmounts {
    // Calculate fee and total required amount
    const transferAmount = Money.fromMinorUnits(BigInt(amountMinorUnits));
    const feeAmount = calculateFee(transferAmount, type);
    const totalRequiredAmount = transferAmount.add(feeAmount);
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
   * The new balance returned is determined based on whether the sender or receiver is the system wallet to ensure accurate reporting of the user's balance after the transaction.
   */
  private async executeACIDTransfer(
    senderWalletId: WalletId,
    receiverWalletId: WalletId,
    systemWalletId: WalletId,
    transferAmount: Money,
    totalRequiredAmount: Money,
    feeAmount: Money,
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
        const walletsToLock = [
          senderWalletId.value,
          receiverWalletId.value,
          systemWalletId.value,
        ].sort();

        // Acquire locks on the wallets using a raw SQL query with "FOR NO KEY UPDATE" to prevent other transactions from modifying these rows until the current transaction is complete
        await tsx.$queryRaw(
          Prisma.sql`SELECT id FROM wallets WHERE id IN(${Prisma.join(walletsToLock)}) FOR NO KEY UPDATE`,
        );

        // -----------------------------------------------------------------
        // 2. RE-FETCH FRESH STATE
        // -----------------------------------------------------------------
        const lockedSender = await tsx.wallet.findUnique({
          where: { id: senderWalletId.value },
        });
        const lockedReceiver = await tsx.wallet.findUnique({
          where: { id: receiverWalletId.value },
        });
        const lockedSystem = await tsx.wallet.findUnique({
          where: { id: systemWalletId.value },
        });

        // Critical check to ensure all wallets are still present after acquiring locks
        if (!lockedSender || !lockedReceiver || !lockedSystem) {
          throw new InternalServerErrorException(
            'A required wallet vanished during lock acquis',
          );
        }

        // Check if sender has sufficient funds after acquiring locks to prevent issues with concurrent transactions that may have modified the sender's balance before locks were acquired
        const lockedSenderBalance = Money.fromMinorUnits(lockedSender.balance);
        if (lockedSenderBalance.isLessThan(totalRequiredAmount)) {
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
            amount: transferAmount.minorUnits,
            fee: feeAmount.minorUnits,
            reference,
            senderWalletId: senderWalletId.value,
            receiverWalletId: receiverWalletId.value,
          },
        });

        // -----------------------------------------------------------------
        // 4. DOUBLE-ENTRY LEDGER & WALLET UPDATES
        // -----------------------------------------------------------------
        // Get dynamic ledger description based on transaction type and involved parties to enhance the clarity of ledger entries for auditing and user transaction history purposes
        const { debitDescription, creditDescription } =
          DynamicLedgerDescription(type, senderWalletId, receiverWalletId);

        // Update Sender (Atomic Decrement) - The sender's wallet balance is decremented by the total required amount (transfer amount + fee), and a corresponding ledger entry is created to reflect the debit.
        const updatedSender = await tsx.wallet.update({
          where: { id: senderWalletId.value },
          data: { balance: { decrement: totalRequiredAmount.minorUnits } },
        });

        // Create ledger entry for sender's debit transaction. This entry provides a clear record of the amount debited from the sender's wallet, the resulting balance after the transaction, and a description for auditing and user transaction history purposes.
        await tsx.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            walletId: senderWalletId.value,
            type: 'DEBIT',
            amount: totalRequiredAmount.minorUnits,
            balanceAfter: updatedSender.balance,
            description: debitDescription,
          },
        });

        // Update Receiver (Atomic increment) - The receiver's wallet balance is incremented by the transfer amount, and a corresponding ledger entry is created to reflect the credit.
        const updatedReceiver = await tsx.wallet.update({
          where: { id: receiverWalletId.value },
          data: { balance: { increment: transferAmount.minorUnits } },
        });

        // Create ledger entry for receiver's credit transaction. This entry provides a clear record of the amount credited to the receiver's wallet, the resulting balance after the transaction, and a description for auditing and user transaction history purposes.
        await tsx.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            walletId: receiverWalletId.value,
            type: 'CREDIT',
            amount: transferAmount.minorUnits,
            balanceAfter: updatedReceiver.balance,
            description: creditDescription,
          },
        });

        // TODO (Performance) : Extract System Wallet update to a batched async chronometer to prevent Hot Row connection at extreme scale
        // Update System Revenue (If Fee exists) - If there is a fee involved in the transaction, the system wallet balance is incremented by the fee amount
        if (!feeAmount.isZero()) {
          const updatedSystem = await tsx.wallet.update({
            where: { id: systemWalletId.value },
            data: { balance: { increment: feeAmount.minorUnits } },
          });

          // Create ledger entry for system wallet's credit transaction to record the fee collection. This entry provides a clear record of the fee amount credited to the system wallet, the resulting balance after the transaction, and a description for auditing and financial reporting purposes.
          await tsx.ledgerEntry.create({
            data: {
              transactionId: transactionRecord.id,
              walletId: systemWalletId.value,
              type: 'CREDIT',
              amount: feeAmount.minorUnits,
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
          newBalance: senderWalletId.equals(this.cachedSystemWalletId)
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
