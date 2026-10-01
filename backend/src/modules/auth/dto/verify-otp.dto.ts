import {
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'Otp must be exactly 6 digits',
  })
  otp: string = '';

  @IsNotEmpty()
  @IsString()
  deviceId: string = '';

  @IsNotEmpty()
  @IsUUID('4')
  challengeId: string = '';
}
