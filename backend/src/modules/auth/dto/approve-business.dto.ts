import { IsIn, IsNotEmpty, IsPhoneNumber } from 'class-validator';
import { Role } from 'src/domain/enums';

export class ApproveBusinessDto {
  @IsNotEmpty()
  @IsPhoneNumber('BD')
  phone: string = '';

  @IsIn([Role.AGENT, Role.MERCHANT])
  role: Role = Role.CUSTOMER;
}
