import { WalletType } from 'generated/prisma/enums';

export interface BalanceResponse {
  readonly id: string;
  readonly balance: bigint;
  readonly type: WalletType;
  readonly currency: string;
  readonly isActive: boolean;
}

export interface WalletOwnerResponse extends BalanceResponse {
  readonly userId: string | null;
  readonly createdAT: Date;
}

export interface WalletStateForTransaction {
  readonly id: string;
  readonly type: WalletType;
  readonly balance: bigint;
}
