import { IsUUID } from 'class-validator';

export class WalletIdParam {
  @IsUUID(4, { message: 'walletId must be a valid UUID v4.' })
  walletId: string;
}
