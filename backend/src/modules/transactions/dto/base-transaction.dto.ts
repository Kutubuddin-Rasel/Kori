import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

export class BaseTransactionDto {

    @IsNumberString(
        { no_symbols: true },
        { message: 'Amount must be a strictly positive integer without decimals (measured in Poisha)' })
    @IsNotEmpty()
    amount: string;


    @IsString()
    @IsOptional()
    @MaxLength(100)
    reference?: string;
}