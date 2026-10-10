import {
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SendOtpDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  @Matches(/\S/, {
    message: 'Device ID must contain a non-whitespace character',
  })
  deviceId: string = '';
}
