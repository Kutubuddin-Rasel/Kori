import { IsNotEmpty, IsPhoneNumber } from 'class-validator';
import { BaseTransactionDto } from './base-transaction.dto';

export class CashOutDto extends BaseTransactionDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  agentPhone: string = '';
}
