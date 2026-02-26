import { IsEmpty, IsPhoneNumber, IsString, Length } from 'class-validator';

export class AuthCredentialsDto {
  @IsEmpty()
  @IsPhoneNumber('BD')
  phone: string;

  @IsEmpty()
  @IsString()
  @Length(4, 5, { message: 'PIN must be 4 or 5 digits' })
  pin: string;

  @IsEmpty()
  @IsString()
  deviceId: string;
}
