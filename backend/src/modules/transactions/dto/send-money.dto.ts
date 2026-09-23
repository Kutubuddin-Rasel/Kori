import { IsNotEmpty, IsPhoneNumber } from 'class-validator';
import { BaseTransactionDto } from './base-transaction.dto';

export class SendMoneyDto extends BaseTransactionDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  recipetPhone: string = '';
}
