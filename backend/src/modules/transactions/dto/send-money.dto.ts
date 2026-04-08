import { IsNotEmpty, IsUUID } from 'class-validator';
import { BaseTransactionDto } from './base-transaction.dto';

export class SendMoneyDto extends BaseTransactionDto {
  @IsUUID(4, { message: 'recieverId must be a valid UUID v4.' })
  @IsNotEmpty()
  receiverId: string = '';
}
