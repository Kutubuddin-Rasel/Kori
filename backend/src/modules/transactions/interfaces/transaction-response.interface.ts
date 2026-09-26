import { TransactionStatus, TransactionType } from 'generated/prisma/enums';
import { Money } from 'src/domain/value-objects/money.vo';
// This file defines the interfaces for transaction responses in the application.
export interface TransactionResultResponse {
  readonly trxId: string;
  readonly type: TransactionType;
  readonly amount: string;
  readonly fee: string;
  readonly status: TransactionStatus;
  readonly createdAt: Date;
  readonly newBalance: string;
}
// This interface represents the response for a transaction validation, including the transfer amount, fee, and total required amount.
export interface TransactionAmounts {
  readonly transferAmount: Money;
  readonly feeAmount: Money;
  readonly totalRequiredAmount: Money;
}
