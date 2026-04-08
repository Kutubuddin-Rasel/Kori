import { IsNotEmpty, IsPhoneNumber, IsString, Length } from 'class-validator';

export class AuthCredentialsDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsNotEmpty()
  @IsString()
  @Length(4, 5, { message: 'PIN must be 4 or 5 digits' })
  pin: string = '';

  @IsNotEmpty()
  @IsString()
  deviceId: string = '';
}
