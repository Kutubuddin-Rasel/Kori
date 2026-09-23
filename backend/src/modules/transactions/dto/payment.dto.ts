import {
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';
import { BaseTransactionDto } from './base-transaction.dto';

export class PaymentDto extends BaseTransactionDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  merchantPhone: string = '';

  @IsString()
  @IsOptional()
  @MaxLength(50)
  invoiceNumber?: string;
}
