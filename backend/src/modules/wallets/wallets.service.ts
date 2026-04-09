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
import { CreateSystemWalletDto } from './dto/create-system-wallet.dto';
import {
  DefaultArgs,
  PrismaClientKnownRequestError,
} from '@prisma/client/runtime/client';
import { PrismaClient } from 'generated/prisma/client';

/**
 * WalletsService is responsible for all wallet-related operations, including retrieving wallet balances,
 * creating personal and system wallets, and managing wallet status (active/inactive).
 * It interacts with the database through PrismaService and provides methods that can be used by other modules,
 * the Transactions module, to perform wallet lookups and updates as part of transaction processing.
 */
@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger = new Logger(WalletsService.name),
  ) {}

  /*
    User-facing: Get the balance and status of the user's wallet
   */
  async getMyBalance(userId: string): Promise<WalletBalanceResponse> {
    try {
      // Check if the wallet is active here, to prevent users from attempting transactions with frozen wallets.
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
        },
      });

      // The wallet may exist but be inactive.
      if (!wallet) {
        throw new NotFoundException(
          'No wallet found for this account. Contact Support',
        );
      }

      // If the wallet is frozen, throw an error.
      if (!wallet.isActive) {
        throw new BadRequestException(
          'Your wallet is currently frozen. Contact support.',
        );
      }
      return wallet;
    } catch (error) {
      this.logger.error(
        'Failed to get wallet by user ID',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'An error ocured while getting wallet by user ID',
      );
    }
  }

  /*
  Internal API : Create a Personal Wallet during Registration
  Accepts a Prisma Transaction Context to maintain cross-module ACID guarantees
  */
  async createPersonalWallet(
    tx: Omit<
      PrismaClient<never, undefined, DefaultArgs>,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
    >,
    userId: string,
  ): Promise<void> {
    await tx.wallet.create({
      data: { userId, type: 'PERSONAL', balance: 0n },
    });
  }

  /* 
    Admin-facing: Look up any wallet via it's own userId.
   */
  async getWalletById(walletId: string): Promise<WalletOwnerResponse> {
    try {
      // This method is used by admins to look up any wallet by its ID.
      // It returns detailed information about the wallet.
      const wallet = await this.prisma.wallet.findUnique({
        where: { id: walletId },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
          createdAT: true,
          userId: true,
        },
      });

      if (!wallet) {
        throw new NotFoundException(
          `Wallet with ID:${walletId} does not exist.`,
        );
      }
      return wallet;
    } catch (error) {
      this.logger.error(
        'Failed to get wallet by ID',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'An error ocured while getting wallet by ID',
      );
    }
  }

  /*
    Admin-only: Create a System or Marchent wallet.
      These wallets have no userID.
   */
  async createSystemWallet(
    SystemWalletDto: CreateSystemWalletDto,
  ): Promise<WalletOwnerResponse> {
    try {
      const wallet = await this.prisma.wallet.create({
        data: {
          type: SystemWalletDto.type,
          currency: SystemWalletDto.currency,
        },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
          createdAT: true,
          userId: true,
        },
      });

      this.logger.log(`${SystemWalletDto.type} is created : id: ${wallet.id}`);

      return wallet;
    } catch (error) {
      /**
       * Prisma error code P2002 is a unique constraint violation, which in this context likely means an attempt to create a duplicate system wallet of the same type and currency.
       */
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A wallet with this instance already exists.',
        );
      }
      throw error;
    }
  }

  /*
    Admin-only: Freeze a wallet. The wallet can not transact
   */
  async deactiveWallet(walletId: string): Promise<WalletOwnerResponse> {
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        isActive: true,
      },
    });

    if (!existingWallet) {
      throw new NotFoundException(`Wallet wiht ID:${walletId} is not exist`);
    }
    if (!existingWallet.isActive) {
      throw new ConflictException('Wallet is already deactived');
    }

    // Update the wallet's isActive status to false, so it can no longer be used for trnasactions.
    try {
      const wallet = await this.prisma.wallet.update({
        where: { id: walletId },
        data: { isActive: false },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
          createdAT: true,
          userId: true,
        },
      });

      return wallet;
    } catch (error) {
      this.logger.error(
        'Failed to update wallet status',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'An error ocured while changing wallet status',
      );
    }
  }

  /*
    Admin-only: Freeze a wallet. The wallet can not transact
   */
  async activeWallet(walletId: string): Promise<WalletOwnerResponse> {
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        isActive: true,
      },
    });

    if (!existingWallet) {
      throw new NotFoundException(`Wallet wiht ID:${walletId} is not exist`);
    }
    if (existingWallet.isActive) {
      throw new ConflictException('Wallet is already actived');
    }

    // Update the wallet's isActive status to true, so it can be used for trnasactions again.
    try {
      const wallet = await this.prisma.wallet.update({
        where: { id: walletId },
        data: { isActive: true },
        select: {
          id: true,
          balance: true,
          type: true,
          isActive: true,
          currency: true,
          createdAT: true,
          userId: true,
        },
      });

      return wallet;
    } catch (error) {
      this.logger.error(
        'Failed to update wallet status',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'An error ocured while changing wallet status',
      );
    }
  }

  /**
   * High-performance projection used strictly for pre-flight financial checks.
   * Pulls only the bytes necessary from the database.
   */
  async getWalletStateForTransaction(
    walletId: string,
  ): Promise<WalletStateForTransaction> {
    try {
      // Check if the wallet is active here, to prevent users from attempting transactions with frozen wallets.
      const wallet = await this.prisma.wallet.findUnique({
        where: {
          id: walletId,
          isActive: true,
        },
        select: {
          id: true,
          type: true,
          balance: true,
        },
      });

      if (!wallet) {
        throw new NotFoundException(
          `Wallet with ID:${walletId} does not exist.`,
        );
      }

      return wallet;
    } catch (error) {
      this.logger.error(
        'Failed to get wallet state for transaction',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'An error ocured while getting wallet state for transaction',
      );
    }
  }
}
