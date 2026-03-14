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
  BalanceResponse,
  WalletOwnerResponse,
} from './interfaces/wallet-interface';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { WalletIdParam } from './dto/wallet-id.param.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from 'generated/prisma/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSystemWalletDto } from './dto/create-system-wallet.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('my-balance')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  async getMyBalance(
    @CurrentUser('sub') userId: string,
  ): Promise<BalanceResponse> {
    return this.walletsService.getMyBalance(userId);
  }

  @Get(':walletId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getWalletById(
    @Param() params: WalletIdParam,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.getWalletById(params.walletId);
  }

  @Post('system')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createSystemWallet(
    @Body() systemWalletDto: CreateSystemWalletDto,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.createSystemWallet(systemWalletDto);
  }

  @Patch(':walletId/active')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async activeWallet(
    @Param() params: WalletIdParam,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.activeWallet(params.walletId);
  }

  @Patch(':walletId/deactive')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deactiveWallet(
    @Param() params: WalletIdParam,
  ): Promise<WalletOwnerResponse> {
    return this.walletsService.deactiveWallet(params.walletId);
  }
}
