import { IsNotEmpty, IsUUID } from "class-validator";
import { BaseTransactionDto } from "./base-transaction.dto";

export class CashInDto extends BaseTransactionDto {
    @IsUUID(4, { message: 'receiverId must be a valid UUID v4.' })
    @IsNotEmpty()
    receiverId: string;
}   