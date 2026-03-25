import { TransactionType } from 'generated/prisma/enums';

export function calculateFee(amount: bigint, type: TransactionType): bigint {
  switch (type) {
    case TransactionType.SEND_MONEY:
      return 500n;
    case TransactionType.CASH_OUT:
      return (amount * 185n) / 10000n;
    case TransactionType.CASH_IN:
    case TransactionType.PAYMENT:
    case TransactionType.ADD_MONEY:
      return 0n;
    default:
      throw new Error('Fee configuration missing for transaction type');
  }
}
