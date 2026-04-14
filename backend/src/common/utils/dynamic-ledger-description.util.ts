import { TransactionType } from 'generated/prisma/enums';

// Interface for defining the structure of ledger descriptions
interface LedgerDescription {
  debitDescription: string;
  creditDescription: string;
}

/**
 * The Strategy Type
 * Define a strict fucntion signature that every transaction type must follow.
 */
type LedgerDescriptionStrategy = (
  senderId: string,
  receiverId: string,
) => LedgerDescription;

/**
 * The Configuration Dictionary
 * (Open for extendsion)
 * Map each TransactionType to its corresponding strategy function.
 * This allows for easy addition of new transaction types without modifying existing logic.
 */
const dynamicLedgerDescriptionStrategies: Record<
  TransactionType,
  LedgerDescriptionStrategy
> = {
  // Example strategies for different transaction types
  [TransactionType.SEND_MONEY]: (senderId, receiverId) => ({
    debitDescription: `Sent Money to ${receiverId}`,
    creditDescription: `Money received from ${senderId}`,
  }),
  [TransactionType.CASH_IN]: (senderId, receiverId) => ({
    debitDescription: `Cash In to User ${receiverId}`,
    creditDescription: `Cash deposit processed by Agent ${senderId}`,
  }),
  [TransactionType.CASH_OUT]: (senderId, receiverId) => ({
    debitDescription: `Cash Out withdrawl debit via Agent ${receiverId}`,
    creditDescription: `Cash Out fulfillment from User ${senderId}`,
  }),
  [TransactionType.PAYMENT]: (senderId, receiverId) => ({
    debitDescription: `Payment completed to Merchant ${receiverId}`,
    creditDescription: `Payment received from User ${senderId}`,
  }),
  [TransactionType.ADD_MONEY]: (senderId, receiverId) => ({
    debitDescription: `System Float allocation for User ${receiverId}`,
    creditDescription: `Digital Money Minted from External Bank for User ${receiverId}`,
  }),
};

/**
 * The Dynamic Ledger Description Function
 * (Closed for modification)
 * This function takes the transaction type and relevant user IDs to generate appropriate ledger descriptions.
 * It uses the strategy pattern to determine the correct description based on the transaction type.
 * If a strategy for the given transaction type is not found, it falls back to a default description format.
 * @param type - The type of transaction
 * @param senderId - The ID of the sender involved in the transaction
 * @param receiverId - The ID of the receiver involved in the transaction
 * @returns - An object containing the debit and credit descriptions for the ledger entry based on the transaction type.
 */
export function DynamicLedgerDescripton(
  type: TransactionType,
  senderId: string,
  receiverId: string,
): LedgerDescription {
  const strategy = dynamicLedgerDescriptionStrategies[type];

  if (!strategy) {
    return {
      debitDescription: `FallBack debit for ${type} against User ${receiverId}`,
      creditDescription: `FallBack credit for ${type} from User ${senderId}`,
    };
  }
  return strategy(senderId, receiverId);
}
