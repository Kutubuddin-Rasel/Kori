import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import {
  WalletBalanceResponse,
  WalletOwnerResponse,
  WalletStateForTransaction,
} from './interfaces/wallet-interface';
import { Prisma } from 'generated/prisma/client';
import { AccountStatus, Role, WalletType } from 'src/domain/enums';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { WalletId } from 'src/domain/value-objects/wallet-id.vo';
import { PhoneNumber } from 'src/domain/value-objects/phone-number.vo';
import { WalletMapper } from 'src/infrastructure/prisma/mappers/wallet.mapper';
import { AccountMapper } from 'src/infrastructure/prisma/mappers/account.mapper';

/**
 * WalletsService is responsible for all wallet-related operations, including retrieving wallet balances,
 * creating personal and system wallets, and managing wallet status (active/inactive).
 * It interacts with the database through PrismaService and provides methods that can be used by other modules,
 * the Transactions module, to perform wallet lookups and updates as part of transaction processing.
 */

@Injectable()
export class WalletsService {
  private logger = new Logger(WalletsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * User-facing: Get the balance and status of the user's wallet
   */
  async getMyBalance(userId: UserId): Promise<WalletBalanceResponse> {
    // Get the wallet
    const wallet = await this.prisma.wallet
      .findUnique({
        where: { userId: userId.value },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
        },
      })
      .catch((error) => {
        this.logger.error(
          'Failed to get wallet by user ID',
          error instanceof Error ? error.stack : error,
        );
        throw new InternalServerErrorException('Failed to retrive wallet');
      });

    // The wallet is not found in the database, throw a NotFoundException to inform the user that they do not have a wallet associated with their account.
    if (!wallet) {
      throw new NotFoundException(
        'No wallet found for this account. Contact Support',
      );
    }

    return {
      ...wallet,
      type: WalletMapper.toDomainType(wallet.type),
    };
  }

  /**
   * Internal API : Create a Personal Wallet during Registration
   * Accepts a Prisma Transaction Context to maintain cross-module ACID guarantees
   */
  async createPersonalWallet(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.wallet.create({
      data: {
        userId,
        type: WalletMapper.toPrismaType(WalletType.PERSONAL),
        balance: 0n,
      },
    });
  }

  /* 
    Admin-facing: Look up any wallet via it's own userId.
   */
  async getWalletById(walletId: WalletId): Promise<WalletOwnerResponse> {
    /**
     * DB call to get the wallet
     * This method is used by admins to look up any wallet by its ID.
     * It returns detailed information about the wallet.
     */

    const wallet = await this.prisma.wallet
      .findUnique({
        where: { id: walletId.value },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
          createdAT: true,
          userId: true,
        },
      })
      .catch((error) => {
        this.logger.error(
          'Failed to get wallet by ID',
          error instanceof Error ? error.stack : error,
        );
        throw new InternalServerErrorException('Failed to retrive wallet');
      });

    // The wallet is not found in the database, throw a NotFoundException to inform the admin that the wallet with the specified ID does not exist.
    if (!wallet) {
      throw new NotFoundException(
        `Wallet with ID:${walletId.toString()} does not exist.`,
      );
    }
    return {
      ...wallet,
      type: WalletMapper.toDomainType(wallet.type),
    };
  }

  /*
    Admin-only: Freeze a wallet. The wallet can not transact
   */
  async deactiveWallet(walletId: WalletId): Promise<WalletOwnerResponse> {
    await this.assertManageableWallet(walletId);

    // Update the wallet's isActive status to false, so it can no longer be used for trnasactions.
    const wallet = await this.prisma.wallet.updateMany({
      where: {
        id: walletId.value,
        isActive: true,
        userId: { not: null },
        type: { not: WalletMapper.toPrismaType(WalletType.SYSTEM) },
      },
      data: { isActive: false },
    });

    if (wallet.count !== 1) {
      throw new ConflictException({
        code: 'WALLET_STATE_CHANGED',
        message: 'Wallet is already frozen or its state changed.',
      });
    }
    return this.getWalletById(walletId);
  }

  /*
    Admin-only: Freeze a wallet. The wallet can not transact
   */
  async activeWallet(walletId: WalletId): Promise<WalletOwnerResponse> {
    await this.assertManageableWallet(walletId);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.wallet.updateMany({
        where: {
          id: walletId.value,
          isActive: false,
          userId: { not: null },
          type: { not: WalletMapper.toPrismaType(WalletType.SYSTEM) },
        },
        data: { isActive: true },
      });

      if (result.count !== 1) {
        throw new ConflictException({
          code: 'WALLET_STATE_CHANGED',
          message: 'Wallet is already active or its state changed.',
        });
      }

      const wallet = await tx.wallet.findUnique({
        where: {
          id: walletId.value,
          user: {
            is: { status: AccountMapper.toPrismaStatus(AccountStatus.ACTIVE) },
          },
        },
        select: { id: true },
      });

      if (!wallet) {
        throw new ConflictException({
          code: 'ACCOUNT_NOT_ACTIVE',
          message:
            'Cannot activate a wallet whose owner account is restricted.',
        });
      }
    });

    return this.getWalletById(walletId);
  }

  /**
   * High-performance projection used strictly for pre-flight financial checks.
   * Pulls only the bytes necessary from the database.
   */
  async getWalletStateForTransaction(
    walletId: WalletId,
  ): Promise<WalletStateForTransaction> {
    // DB call to get the wallet state for transaction
    const wallet = await this.prisma.wallet
      .findUnique({
        where: {
          id: walletId.value,
          isActive: true,
        },
        select: {
          id: true,
          type: true,
          balance: true,
          currency: true,
        },
      })
      .catch((error) => {
        this.logger.error(
          'Failed to get wallet state for transaction',
          error instanceof Error ? error.stack : error,
        );

        throw new InternalServerErrorException(
          'An error ocured while getting wallet state for transaction',
        );
      });

    // The wallet is not found in the database, throw a NotFoundException to inform the caller that the wallet with the specified ID does not exist or is inactive.
    if (!wallet) {
      throw new NotFoundException(
        `Wallet with ID:${walletId.toString()} does not exist.`,
      );
    }

    return {
      ...wallet,
      type: WalletMapper.toDomainType(wallet.type),
      currency: WalletMapper.toDomainCurrency(wallet.currency),
    };
  }

  async getOwnWalletId(userId: UserId): Promise<WalletId> {
    let wallet: { id: string } | null;

    try {
      wallet = await this.prisma.wallet.findUnique({
        where: { userId: userId.value },
        select: {
          id: true,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to resolve wallet for user',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException('Failed to resolve wallet');
    }

    if (!wallet) {
      throw new NotFoundException(
        'No wallet found for this account. Contact support.',
      );
    }

    return WalletId.from(wallet.id);
  }

  async resolveWalletIdByPhone(phone: PhoneNumber): Promise<WalletId> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { phone: phone.value },
        select: {
          wallet: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!user?.wallet) {
        throw new NotFoundException('Recipient account not found.');
      }

      return WalletId.from(user.wallet.id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        'Failed to resolve wallet by phone number',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'Failed to resolve recipient account',
      );
    }
  }

  async createBusinessWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    role: Role,
  ): Promise<void> {
    if (role !== Role.AGENT && role !== Role.MERCHANT) {
      throw new BadRequestException(
        'Only AGENT and MERCHANT wallets can be provisioned here.',
      );
    }

    const walletType =
      role === Role.AGENT ? WalletType.AGENT : WalletType.MERCHANT;

    await tx.wallet.create({
      data: {
        userId,
        type: WalletMapper.toPrismaType(walletType),
        balance: 0n,
      },
    });
  }

  private async assertManageableWallet(walletId: WalletId): Promise<void> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId.value },
      select: {
        id: true,
        type: true,
        userId: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found.',
      });
    }

    if (WalletMapper.toDomainType(wallet.type) === WalletType.SYSTEM) {
      throw new ConflictException({
        code: 'SYSTEM_WALLET_PROTECTED',
        message:
          'The SYSTEM wallet cannot be frozen or activated through this operation.',
      });
    }

    if (!wallet.userId) {
      throw new ConflictException({
        code: 'WALLET_OWNER_INVALID',
        message: 'Wallet ownership is invalid.',
      });
    }
  }
}
