import { WalletType as PrismaWalletType } from 'generated/prisma/enums';
import { WalletType as DomainWalletType } from 'src/domain/enums';

const PRISMA_TO_DOMAIN: Record<PrismaWalletType, DomainWalletType> = {
  [PrismaWalletType.PERSONAL]: DomainWalletType.PERSONAL,
  [PrismaWalletType.AGENT]: DomainWalletType.AGENT,
  [PrismaWalletType.MERCHANT]: DomainWalletType.MERCHANT,
  [PrismaWalletType.SYSTEM]: DomainWalletType.SYSTEM,
};

const DOMAIN_TO_PRISMA: Record<DomainWalletType, PrismaWalletType> = {
  [DomainWalletType.PERSONAL]: PrismaWalletType.PERSONAL,
  [DomainWalletType.AGENT]: PrismaWalletType.AGENT,
  [DomainWalletType.MERCHANT]: PrismaWalletType.MERCHANT,
  [DomainWalletType.SYSTEM]: PrismaWalletType.SYSTEM,
};

export class WalletMapper {
  static toDomainType(prismaType: PrismaWalletType): DomainWalletType {
    return PRISMA_TO_DOMAIN[prismaType];
  }

  static toPrismaType(domainType: DomainWalletType): PrismaWalletType {
    return DOMAIN_TO_PRISMA[domainType];
  }
}
