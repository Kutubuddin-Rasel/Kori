import { TransactionType } from 'generated/prisma/enums';
// Interface for defining the structure of ledger descriptions
type FeeStrategy = (amount: bigint) => bigint;

/**
 * The Configuration Dictionary
 * (Open for extension)
 * Map each TransactionType to its corresponding fee calculation strategy function.
 * This allows for easy addition of new transaction types and their fee logic without modifying existing code.
 */
const feeStrategies: Record<TransactionType, FeeStrategy> = {
  [TransactionType.SEND_MONEY]: () => 500n,
  [TransactionType.CASH_OUT]: (amount) => (amount * 185n) / 10000n,
  [TransactionType.CASH_IN]: () => 0n,
  [TransactionType.PAYMENT]: () => 0n,
  [TransactionType.ADD_MONEY]: () => 0n,
};

/**
 * The Fee Calculation Function
 * (Closed for modification)
 * This function takes the transaction amount and type to calculate the appropriate fee.
 * It uses the strategy pattern to determine the correct fee calculation based on the transaction type.
 * If a strategy for the given transaction type is not found, it throws an error to indicate a critical configuration issue.
 * @param amount - The amount involved in the transaction for which the fee needs to be calculated
 * @param type - The type of transaction for which the fee is being calculated
 * @returns - The calculated fee as a bigint based on the transaction type and amount.
 */
export function calculateFee(amount: bigint, type: TransactionType): bigint {
  const strategy = feeStrategies[type];
  if (!strategy) {
    throw new Error(
      `Critical: Fee configuration missing for transaction type: ${type}`,
    );
  }
  return strategy(amount);
}
