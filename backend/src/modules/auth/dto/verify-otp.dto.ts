import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SendOtpDto } from './send-otp.dto';

export class VerifyOtpDto extends SendOtpDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'Otp must be exactly 6 digits',
  })
  otp: string = '';

  @IsNotEmpty()
  @IsUUID('4')
  challengeId: string = '';

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  deviceEnrollmentToken?: string;
}
