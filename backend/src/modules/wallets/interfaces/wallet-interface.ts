import { WalletType } from 'generated/prisma/enums';
/**
 * This file defines the interfaces for wallet-related responses and states.
 * - `WalletBalanceResponse`: Represents the response structure for a wallet balance query, including the wallet's ID, balance, type, currency, and active status.
 * - `WalletOwnerResponse`: Extends `WalletBalanceResponse` to include additional information about the wallet owner, such as the user ID and creation date.
 * - `WalletStateForTransaction`: Represents the state of a wallet during a transaction, including its ID, type, and balance.
 */
export interface WalletBalanceResponse {
  readonly id: string;
  readonly balance: bigint;
  readonly type: WalletType;
  readonly currency: string;
  readonly isActive: boolean;
}

export interface WalletOwnerResponse extends WalletBalanceResponse {
  readonly userId: string | null;
  readonly createdAT: Date;
}

export interface WalletStateForTransaction {
  readonly id: string;
  readonly type: WalletType;
  readonly balance: bigint;
}
