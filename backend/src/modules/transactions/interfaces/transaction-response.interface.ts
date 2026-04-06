import { TransactionStatus, TransactionType } from 'generated/prisma/enums';

export interface TransactionResultResponse {
  readonly trxId: string;
  readonly type: TransactionType;
  readonly amount: string;
  readonly fee: string;
  readonly status: TransactionStatus;
  readonly createdAt: Date;
  readonly newBalance: string;
}

export interface TransactionValidationResponse {
  readonly transferAmount: bigint;
  readonly feeAmount: bigint;
  readonly totalRequiredAmount: bigint;
}
