import { IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class SendOtpDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string;

  @IsNotEmpty()
  @IsString()
  deviceId: string;
}
