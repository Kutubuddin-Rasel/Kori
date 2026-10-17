import { AuthenticatedRequest } from 'src/common/decorators/current-user.decorator';
import { AccountStatus, Role } from 'src/domain/enums';

export interface CurrentAccountPayload {
  id: string;
  role: Role;
  status: AccountStatus;
}

export interface CurrentAccountRequest extends AuthenticatedRequest {
  currentAccount?: CurrentAccountPayload;
}
