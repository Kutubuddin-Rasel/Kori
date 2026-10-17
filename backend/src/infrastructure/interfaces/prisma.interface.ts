import {
  Role as PrismaRole,
  AccountStatus as PrismaAccountStatus,
} from 'generated/prisma/enums';

export interface RawAccountPayload {
  id: string;
  role: PrismaRole;
  status: PrismaAccountStatus;
}
