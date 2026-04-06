import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TransactionType } from 'generated/prisma/enums';

export class InitiateTransactionDto {

  @IsUUID(4, { message: 'recieverId must be a valid UUID v4.' })
  @IsNotEmpty()
  receiverId: string;

  @IsNumberString(
    { no_symbols: true },
    { message: 'amount must be a positive integer without decimals.' },
  )
  @IsNotEmpty()
  amount: string;

  @IsEnum(TransactionType, {
    message: `type must be one of: ${Object.values(TransactionType).join(', ')}`,
  })
  @IsNotEmpty()
  type: TransactionType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;
}
