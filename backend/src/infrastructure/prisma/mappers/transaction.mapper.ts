import {
  TransactionType as PrismaTxType,
  TransactionStatus as PrismaTxStatus,
} from 'generated/prisma/enums';
import {
  TransactionType as DomainTxType,
  TransactionStatus as DomainTxStatus,
} from 'src/domain/enums';

const PRISMA_TO_DOMAIN_TYPE: Record<PrismaTxType, DomainTxType> = {
  [PrismaTxType.SEND_MONEY]: DomainTxType.SEND_MONEY,
  [PrismaTxType.CASH_IN]: DomainTxType.CASH_IN,
  [PrismaTxType.CASH_OUT]: DomainTxType.CASH_OUT,
  [PrismaTxType.PAYMENT]: DomainTxType.PAYMENT,
  [PrismaTxType.ADD_MONEY]: DomainTxType.ADD_MONEY,
};

const DOMAIN_TO_PRISMA_TYPE: Record<DomainTxType, PrismaTxType> = {
  [DomainTxType.SEND_MONEY]: PrismaTxType.SEND_MONEY,
  [DomainTxType.CASH_IN]: PrismaTxType.CASH_IN,
  [DomainTxType.CASH_OUT]: PrismaTxType.CASH_OUT,
  [DomainTxType.PAYMENT]: PrismaTxType.PAYMENT,
  [DomainTxType.ADD_MONEY]: PrismaTxType.ADD_MONEY,
};

const PRISMA_TO_DOMAIN_STATUS: Record<PrismaTxStatus, DomainTxStatus> = {
  [PrismaTxStatus.PENDING]: DomainTxStatus.PENDING,
  [PrismaTxStatus.PROCESSING]: DomainTxStatus.PROCESSING,
  [PrismaTxStatus.COMPLETED]: DomainTxStatus.COMPLETED,
  [PrismaTxStatus.FAILED]: DomainTxStatus.FAILED,
  [PrismaTxStatus.REVERSED]: DomainTxStatus.REVERSED,
};

const DOMAIN_TO_PRISMA_STATUS: Record<DomainTxStatus, PrismaTxStatus> = {
  [DomainTxStatus.PENDING]: PrismaTxStatus.PENDING,
  [DomainTxStatus.PROCESSING]: PrismaTxStatus.PROCESSING,
  [DomainTxStatus.COMPLETED]: PrismaTxStatus.COMPLETED,
  [DomainTxStatus.FAILED]: PrismaTxStatus.FAILED,
  [DomainTxStatus.REVERSED]: PrismaTxStatus.REVERSED,
};

export class TransactionMapper {
  static toDomainType(type: PrismaTxType): DomainTxType {
    return PRISMA_TO_DOMAIN_TYPE[type];
  }

  static toPrismaType(type: DomainTxType): PrismaTxType {
    return DOMAIN_TO_PRISMA_TYPE[type];
  }

  static toDomainStatus(status: PrismaTxStatus): DomainTxStatus {
    return PRISMA_TO_DOMAIN_STATUS[status];
  }

  static toPrismaStatus(status: DomainTxStatus): PrismaTxStatus {
    return DOMAIN_TO_PRISMA_STATUS[status];
  }
}
