import { TransactionType } from 'src/domain/enums';
import { Money } from 'src/domain/value-objects/money.vo';
import { divideRoundHlafEven } from './round-half-even';
// Interface for defining the structure of ledger descriptions
type FeeStrategy = (amount: Money) => Money;

/**
 * The Configuration Dictionary
 * (Open for extension)
 * Map each TransactionType to its corresponding fee calculation strategy function.
 * This allows for easy addition of new transaction types and their fee logic without modifying existing code.
 */
const feeStrategies: Record<TransactionType, FeeStrategy> = {
  [TransactionType.SEND_MONEY]: () => Money.fromMinorUnits(500n),
  [TransactionType.CASH_OUT]: (amount) =>
    Money.fromMinorUnits(divideRoundHlafEven(amount.minorUnits * 185n, 10000n)),
  [TransactionType.CASH_IN]: () => Money.zero(),
  [TransactionType.PAYMENT]: () => Money.zero(),
  [TransactionType.ADD_MONEY]: () => Money.zero(),
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
export function calculateFee(amount: Money, type: TransactionType): Money {
  const strategy = feeStrategies[type];
  if (!strategy) {
    throw new Error(
      `Critical: Fee configuration missing for transaction type: ${type}`,
    );
  }
  return strategy(amount);
}
