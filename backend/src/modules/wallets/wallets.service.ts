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
  BalanceResponse,
  WalletOwnerResponse,
  WalletStateForTransaction,
} from './interfaces/wallet-interface';
import { CreateSystemWalletDto } from './dto/create-system-wallet.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger = new Logger(WalletsService.name),
  ) {}

  /*
    User-facing: Return the authenticated user's wallet balance.
   */
  async getMyBalance(userId: string): Promise<BalanceResponse> {
    try {
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

      if (!wallet) {
        throw new NotFoundException(
          'No wallet found for this account. Contact Support',
        );
      }
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
    Cross-module Api: Transaction module call this to find a user's wallet before initiating money movement.
   */
  async getWalletByUserId(userId: string): Promise<BalanceResponse> {
    try {
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

      if (!wallet) {
        throw new NotFoundException(
          'No wallet found for this account. Contact Support',
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
    Admin-facing: Look up any wallet via it's own userId.
   */
  async getWalletById(walletId: string): Promise<WalletOwnerResponse> {
    try {
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
