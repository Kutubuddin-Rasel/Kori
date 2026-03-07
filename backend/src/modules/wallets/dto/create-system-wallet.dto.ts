import {
  IsEnum,
  IsNotEmpty,
  IsNotIn,
  IsString,
  MaxLength,
} from 'class-validator';
import { WalletType } from 'generated/prisma/enums';

export class CreateSystemWalletDto {
  @IsEnum(WalletType, {
    message: `type must be one of: ${Object.values(WalletType).join(', ')}`,
  })
  @IsNotIn([WalletType.PERSONAL], {
    message:
      'PERSONAL wallets are created exclusively during user registration.',
  })
  type: WalletType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(3, {
    message: 'Currency code must be at most 3 characters (e.g., BDT).',
  })
  currency: string;
}
