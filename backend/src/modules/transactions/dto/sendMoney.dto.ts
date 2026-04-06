import {
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export class SendMoneyDto {

    @IsUUID(4, { message: 'recieverId must be a valid UUID v4.' })
    @IsNotEmpty()
    receiverId: string;

    @IsNumberString(
        { no_symbols: true },
        { message: 'amount must be a positive integer without decimals.' },
    )
    @IsNotEmpty()
    amount: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    reference?: string;
}