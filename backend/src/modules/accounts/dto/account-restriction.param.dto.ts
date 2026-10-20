import { IsNotEmpty, IsUUID } from 'class-validator';

export class AccountRestrictionParam {
  @IsNotEmpty()
  @IsUUID('4', { message: 'userId must be a valid UUID v4.' })
  userId: string = '';
}
