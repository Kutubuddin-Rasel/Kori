import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, Role, WalletType } from 'src/domain/enums';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { AccountMapper } from 'src/infrastructure/prisma/mappers/account.mapper';
import { WalletMapper } from 'src/infrastructure/prisma/mappers/wallet.mapper';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AccountRestrictionResponse } from './interface/account-restriction.interface';

@Injectable()
export class AccountRestrictionService {
  constructor(private readonly prisma: PrismaService) {}

  async suspend(targetUserId: UserId): Promise<AccountRestrictionResponse> {
    return await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          id: targetUserId.value,
          role: { not: AccountMapper.toPrismaRole(Role.ADMIN) },
          status: {
            not: AccountMapper.toPrismaStatus(AccountStatus.LOCKED),
          },
          wallet: {
            type: { not: WalletMapper.toPrismaType(WalletType.SYSTEM) },
          },
        },
        select: {
          id: true,
          wallet: { select: { id: true } },
        },
      });

      if (!user) {
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found.',
        });
      }

      if (!user.wallet) {
        throw new ConflictException({
          code: 'ACCOUNT_WALLET_INVALID',
          message: 'Account does not have a valid owned wallet.',
        });
      }

      const frozen = await tx.wallet.updateMany({
        where: {
          id: user.wallet.id,
          userId: user.id,
          type: { not: WalletMapper.toPrismaType(WalletType.SYSTEM) },
        },
        data: { isActive: false },
      });

      if (frozen.count !== 1) {
        throw new ConflictException({
          code: 'ACCOUNT_WALLET_CHANGED',
          message: 'Account wallet changed during suspension.',
        });
      }

      const restricted = await tx.user.updateMany({
        where: {
          id: user.id,
          role: {
            not: AccountMapper.toPrismaRole(Role.ADMIN),
          },
          status: {
            in: [
              AccountMapper.toPrismaStatus(AccountStatus.ACTIVE),
              AccountMapper.toPrismaStatus(AccountStatus.SUSPENDED),
            ],
          },
        },
        data: {
          status: AccountMapper.toPrismaStatus(AccountStatus.SUSPENDED),
        },
      });

      if (restricted.count !== 1) {
        throw new ConflictException({
          code: 'ACCOUNT_STATE_CHANGED',
          message: 'Account state changed during suspension.',
        });
      }

      await tx.trustDevice.updateMany({
        where: {
          userId: user.id,
        },
        data: {
          refreshSessionId: null,
          currentRefreshJti: null,
        },
      });

      return {
        userId: user.id,
        status: AccountStatus.SUSPENDED,
      };
    });
  }

  async reactivate(targetUserId: UserId): Promise<AccountRestrictionResponse> {
    const updated = await this.prisma.user.updateMany({
      where: {
        id: targetUserId.value,
        role: { not: AccountMapper.toPrismaRole(Role.ADMIN) },
        status: AccountMapper.toPrismaStatus(AccountStatus.SUSPENDED),
      },
      data: {
        status: AccountMapper.toPrismaStatus(AccountStatus.ACTIVE),
      },
    });

    if (updated.count !== 1) {
      const account = await this.prisma.user.findUnique({
        where: { id: targetUserId.value },
        select: { id: true },
      });

      if (!account) {
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found.',
        });
      }

      throw new ConflictException({
        code: 'ACCOUNT_NOT_ELIGIBLE_FOR_REACTIVATION',
        message: 'Account cannot be reactivated from its current state.',
      });
    }

    return {
      userId: targetUserId.value,
      status: AccountStatus.ACTIVE,
    };
  }
}
