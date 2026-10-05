import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthCredentialsDto } from './auth-credentials.dto';

export class RegisterDto extends AuthCredentialsDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  registrationToken: string = '';
}
