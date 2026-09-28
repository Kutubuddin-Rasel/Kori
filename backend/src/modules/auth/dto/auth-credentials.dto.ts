import { IsNotEmpty, IsPhoneNumber, IsString, Matches } from 'class-validator';

export class AuthCredentialsDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]{4,5}$/, {
    message: 'PIN must be 4 or 5 numeric digits',
  })
  pin: string = '';

  @IsNotEmpty()
  @IsString()
  deviceId: string = '';
}
