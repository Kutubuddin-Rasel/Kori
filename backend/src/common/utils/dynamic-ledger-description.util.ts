import { TransactionType } from 'generated/prisma/enums';

interface LedgerDescription {
  debitDescription: string;
  creditDescription: string;
}
export function DynamicLedgerDescripton(
  type: TransactionType,
  senderId: string,
  receiverId: string,
): LedgerDescription {
  let debitDescription = '';
  let creditDescription = '';

  switch (type) {
    case TransactionType.SEND_MONEY:
      debitDescription = `Sent Money to ${receiverId}`;
      creditDescription = `Money received from ${senderId}`;
      break;
    case TransactionType.CASH_IN:
      debitDescription = `Cash In to User ${receiverId}`;
      creditDescription = `Cash deposit processed by Agent ${senderId}`;
      break;
    case TransactionType.CASH_OUT:
      debitDescription = `Cash Out withdrawl debit via Agent ${receiverId}`;
      creditDescription = `Cash Out fulfillment from User ${senderId}`;
      break;
    case TransactionType.PAYMENT:
      debitDescription = `Payment completed to Merchant ${receiverId}`;
      creditDescription = `Payment received from User ${senderId}`;
      break;
    case TransactionType.ADD_MONEY:
      debitDescription = `System Float allocation for User ${receiverId}`;
      creditDescription = `Digital Money Minted from External Bank for User ${receiverId}`;
      break;
  }
  return { debitDescription, creditDescription };
}
