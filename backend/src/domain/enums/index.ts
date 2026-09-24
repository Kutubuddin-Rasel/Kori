/**
 * Domain enums - source of truth for all business concepts.
 * These are not from Prisma. Prisma generated enums should match these.
 * The infustructure mapper translates between Domain enums and Prisma enums.
 */

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  SUSPENDED = 'SUSPENDED',
}

export enum WalletType {
  PERSONAL = 'PERSONAL',
  AGENT = 'AGENT',
  MERCHANT = 'MERCHANT',
  SYSTEM = 'SYSTEM',
}

export enum TransactionType {
  SEND_MONEY = 'SEND_MONEY',
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
  PAYMENT = 'PAYMENT',
  ADD_MONEY = 'ADD_MONEY',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum Currency {
  BDT = 'BDT',
}
