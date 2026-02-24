import { IsNotEmpty, IsPhoneNumber, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Length(4, 4, { message: 'Otp must be exactly 4 digits' })
  otp: string;
}
