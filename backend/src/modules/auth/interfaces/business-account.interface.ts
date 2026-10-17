import { Role } from 'generated/prisma/enums';

export interface ApproveBusinessAccountResponse {
  id: string;
  phone: string;
  role: Role;
  expiresAt: Date;
}
