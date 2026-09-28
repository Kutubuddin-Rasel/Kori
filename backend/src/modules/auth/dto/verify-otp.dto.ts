import { IsNotEmpty, IsPhoneNumber, IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]{4}$/, {
    message: 'Otp must be exactly 4 digits',
  })
  otp: string = '';

  @IsNotEmpty()
  @IsString()
  deviceId: string = '';
}
