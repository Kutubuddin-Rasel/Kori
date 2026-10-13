import { AccountStatus, Role } from 'generated/prisma/enums';
import { AuthenticatedRequest } from 'src/common/decorators/current-user.decorator';

export interface CurrentAccountPayload {
  id: string;
  role: Role;
  status: AccountStatus;
}

export interface CurrentAccountRequest extends AuthenticatedRequest {
  currentAccount?: CurrentAccountPayload;
}
