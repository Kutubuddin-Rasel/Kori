import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { BaseTransactionDto } from "./base-transaction.dto";

export class PaymentDto extends BaseTransactionDto {
    @IsUUID(4, { message: 'merchantId must be a valid UUID v4.' })
    @IsNotEmpty()
    merchantId: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    invoiceNumber?: string
}   