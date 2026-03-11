import { WalletType } from 'generated/prisma/enums';

export interface BalanceResponse {
  readonly id: string;
  readonly balance: number;
  readonly type: WalletType;
  readonly currency: string;
  readonly isActive: boolean;
}

export interface WalletOwnerResponse extends BalanceResponse {
  readonly userId: string | null;
  readonly createdAT: Date;
}
