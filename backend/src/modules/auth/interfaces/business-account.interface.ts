import { Role } from 'src/domain/enums';

export interface ApproveBusinessAccountResponse {
  id: string;
  phone: string;
  role: Role;
  expiresAt: Date;
}
