import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { BalanceResponse } from './interfaces/wallet-interface';

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyBalance(userId: string): Promise<BalanceResponse> {
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
        'Secure wallet container not found for this account.',
      );
    }
    if (!wallet.isActive) {
      throw new BadRequestException('Wallet is inactive or locked');
    }
    return wallet;
  }
}
