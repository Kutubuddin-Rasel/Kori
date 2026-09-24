import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class BaseTransactionDto {
  @Matches(/^[1-9]\d*$/, {
    message:
      'Amount must be a strictly positive integer without decimals (measured in Poisha)',
  })
  @IsNotEmpty()
  amountMinorUnits: string = '';

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;
}
