import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { BaseTransactionDto } from './base-transaction.dto';

export class AddMoneyDto extends BaseTransactionDto {
  // The amount is verified againts this secure Token provided by the Payment Gateway after successful settlement
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bankGatewayToken: string = '';
}
