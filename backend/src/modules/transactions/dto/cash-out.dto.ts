import { IsNotEmpty, IsUUID } from "class-validator";
import { BaseTransactionDto } from "./base-transaction.dto";

export class CashOutDto extends BaseTransactionDto {
    @IsUUID(4, { message: 'agentId must be a valid UUID v4.' })
    @IsNotEmpty()
    agentId: string;
}   