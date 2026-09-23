import { IsNotEmpty, IsPhoneNumber } from 'class-validator';
import { BaseTransactionDto } from './base-transaction.dto';

export class CashInDto extends BaseTransactionDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  customerPhone: string = '';
}
