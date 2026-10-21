import {
  WalletType as PrismaWalletType,
  Currency as PrismaCurrency,
} from 'generated/prisma/enums';
import {
  WalletType as DomainWalletType,
  Currency as DomainCurrency,
} from 'src/domain/enums';

const PRISMA_TO_DOMAIN_TYPE: Record<PrismaWalletType, DomainWalletType> = {
  [PrismaWalletType.PERSONAL]: DomainWalletType.PERSONAL,
  [PrismaWalletType.AGENT]: DomainWalletType.AGENT,
  [PrismaWalletType.MERCHANT]: DomainWalletType.MERCHANT,
  [PrismaWalletType.SYSTEM]: DomainWalletType.SYSTEM,
};

const DOMAIN_TO_PRISMA_TYPE: Record<DomainWalletType, PrismaWalletType> = {
  [DomainWalletType.PERSONAL]: PrismaWalletType.PERSONAL,
  [DomainWalletType.AGENT]: PrismaWalletType.AGENT,
  [DomainWalletType.MERCHANT]: PrismaWalletType.MERCHANT,
  [DomainWalletType.SYSTEM]: PrismaWalletType.SYSTEM,
};

const PRISMA_TO_DOMAIN_CURRENCY: Record<PrismaCurrency, DomainCurrency> = {
  [PrismaCurrency.BDT]: DomainCurrency.BDT,
};
const DOMAIN_TO_PRISMA_CURRENCY: Record<DomainCurrency, PrismaCurrency> = {
  [DomainCurrency.BDT]: PrismaCurrency.BDT,
};

export class WalletMapper {
  static toDomainType(prismaType: PrismaWalletType): DomainWalletType {
    return PRISMA_TO_DOMAIN_TYPE[prismaType];
  }

  static toPrismaType(domainType: DomainWalletType): PrismaWalletType {
    return DOMAIN_TO_PRISMA_TYPE[domainType];
  }

  static toDomainCurrency(prismaCurrency: PrismaCurrency): DomainCurrency {
    return PRISMA_TO_DOMAIN_CURRENCY[prismaCurrency];
  }

  static toPrismaCurrency(domainCurrency: DomainCurrency): PrismaCurrency {
    return DOMAIN_TO_PRISMA_CURRENCY[domainCurrency];
  }
}
