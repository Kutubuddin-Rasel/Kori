import { IsIn, IsNotEmpty, IsPhoneNumber } from 'class-validator';
import { Role } from 'generated/prisma/enums';

export class ApproveBusinessDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsIn([Role.AGENT, Role.MERCHANT])
  role: Role = Role.CUSTOMER;
}
