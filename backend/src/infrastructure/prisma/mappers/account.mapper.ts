import {
  Role as PrismaRole,
  AccountStatus as PrismaAccountStatus,
} from 'generated/prisma/enums';
import {
  Role as DomainRole,
  AccountStatus as DomainAccountStatus,
} from 'src/domain/enums';
import { RawAccountPayload } from 'src/infrastructure/interfaces/prisma.interface';

import { CurrentAccountPayload } from 'src/modules/auth/interfaces/active-account.interface';

// ==========================================
// 1. Role Mappings (Bidirectional)
// ==========================================
const PRISMA_TO_DOMAIN_ROLE: Record<PrismaRole, DomainRole> = {
  [PrismaRole.ADMIN]: DomainRole.ADMIN,
  [PrismaRole.CUSTOMER]: DomainRole.CUSTOMER,
  [PrismaRole.AGENT]: DomainRole.AGENT,
  [PrismaRole.MERCHANT]: DomainRole.MERCHANT,
};

const DOMAIN_TO_PRISMA_ROLE: Record<DomainRole, PrismaRole> = {
  [DomainRole.CUSTOMER]: PrismaRole.CUSTOMER,
  [DomainRole.AGENT]: PrismaRole.AGENT,
  [DomainRole.MERCHANT]: PrismaRole.MERCHANT,
  [DomainRole.ADMIN]: PrismaRole.ADMIN,
};

// ==========================================
// 2. AccountStatus Mappings (Bidirectional)
// ==========================================
const PRISMA_TO_DOMAIN_STATUS: Record<
  PrismaAccountStatus,
  DomainAccountStatus
> = {
  [PrismaAccountStatus.ACTIVE]: DomainAccountStatus.ACTIVE,
  [PrismaAccountStatus.LOCKED]: DomainAccountStatus.LOCKED,
  [PrismaAccountStatus.SUSPENDED]: DomainAccountStatus.SUSPENDED,
};

const DOMAIN_TO_PRISMA_STATUS: Record<
  DomainAccountStatus,
  PrismaAccountStatus
> = {
  [DomainAccountStatus.ACTIVE]: PrismaAccountStatus.ACTIVE,
  [DomainAccountStatus.LOCKED]: PrismaAccountStatus.LOCKED,
  [DomainAccountStatus.SUSPENDED]: PrismaAccountStatus.SUSPENDED,
};

// ==========================================
// 3. Mapper Class
// ==========================================
export class AccountMapper {
  // Read path: Prisma -> Domain
  static toDomainRole(prismaRole: PrismaRole): DomainRole {
    return PRISMA_TO_DOMAIN_ROLE[prismaRole];
  }

  static toDomainStatus(
    prismaStatus: PrismaAccountStatus,
  ): DomainAccountStatus {
    return PRISMA_TO_DOMAIN_STATUS[prismaStatus];
  }

  static toCurrentAccountPayload(
    raw: RawAccountPayload,
  ): CurrentAccountPayload {
    return {
      id: raw.id,
      role: this.toDomainRole(raw.role),
      status: this.toDomainStatus(raw.status),
    };
  }

  // Write path: Domain -> Prisma
  static toPrismaRole(domainRole: DomainRole): PrismaRole {
    return DOMAIN_TO_PRISMA_ROLE[domainRole];
  }
  static toPrismaStatus(
    domainStatus: DomainAccountStatus,
  ): PrismaAccountStatus {
    return DOMAIN_TO_PRISMA_STATUS[domainStatus];
  }
}
