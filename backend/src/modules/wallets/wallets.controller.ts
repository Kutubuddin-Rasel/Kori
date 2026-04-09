import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import {
  WalletBalanceResponse,
  WalletOwnerResponse,
} from './interfaces/wallet-interface';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { WalletIdParam } from './dto/wallet-id.param.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from 'generated/prisma/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSystemWalletDto } from './dto/create-system-wallet.dto';

/**
 * WalletsController manages all wallet-related endpoints, including retrieving wallet balances,
 * fetching wallet details by ID, creating system wallets, and activating/deactivating wallets.
 * It uses the WalletsService to perform the actual business logic and is protected by the
 * AccessTokenGuard to ensure that only authenticated users can access these endpoints. Additionally,
 * certain endpoints are restricted to admin users using the RolesGuard and Roles decorator.
 */
@Controller('wallets')
@UseGuards(AccessTokenGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  // Endpoint for users to retrieve their wallet balance and details
  @Get('my-balance')
  @HttpCode(HttpStatus.OK)
  async getMyBalance(
    @CurrentUser('sub') userId: string,
  ): Promise<WalletBalanceResponse> {
    return this.walletsService.getMyBalance(userId);
  }

  // Endpoint for admin users to retrieve wallet details by wallet ID
  @Get(':walletId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getWalletById(
    @Param() params: WalletIdParam,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.getWalletById(params.walletId);
  }

  // Endpoint for admin users to create a new system wallet
  @Post('system')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createSystemWallet(
    @Body() systemWalletDto: CreateSystemWalletDto,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.createSystemWallet(systemWalletDto);
  }

  // Endpoint for admin users to activate a wallet by wallet ID
  @Patch(':walletId/activate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async activeWallet(
    @Param() params: WalletIdParam,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.activeWallet(params.walletId);
  }

  // Endpoint for admin users to deactivate a wallet by wallet ID
  @Patch(':walletId/deactivate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deactiveWallet(
    @Param() params: WalletIdParam,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.deactiveWallet(params.walletId);
  }
}
