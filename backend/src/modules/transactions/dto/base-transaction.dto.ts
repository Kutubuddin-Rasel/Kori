import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  MAX_TRANSACTION_AMOUNT_DIGITS,
  POSITIVE_MINOR_UNITS_PATTERN,
} from '../constants/transaction-amount.constants';

export class BaseTransactionDto {
  @IsNotEmpty()
  @IsString()
  @Matches(POSITIVE_MINOR_UNITS_PATTERN, {
    message:
      'Amount must be a strictly positive integer without decimals (measured in Poisha)',
  })
  @MaxLength(MAX_TRANSACTION_AMOUNT_DIGITS)
  amountMinorUnits: string = '';

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;
}
