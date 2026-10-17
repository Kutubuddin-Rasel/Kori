import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CurrentAccountRequest } from '../interfaces/active-account.interface';
import { AccountStatus } from 'src/domain/enums';
import { RawAccountPayload } from 'src/infrastructure/interfaces/prisma.interface';
import { AccountMapper } from 'src/infrastructure/prisma/mappers/account.mapper';

@Injectable()
export class ActiveAccountGuard implements CanActivate {
  private readonly logger = new Logger(ActiveAccountGuard.name);
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<CurrentAccountRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    let rawAccount: RawAccountPayload | null = null;

    try {
      rawAccount = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to get user state for authorization',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'An error occurred while verifying account status.',
      );
    }

    if (!rawAccount) {
      throw new UnauthorizedException('User account not found.');
    }

    const account = AccountMapper.toCurrentAccountPayload(rawAccount);

    if (account.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        'Your account is currently restricted. Please contact support.',
      );
    }

    request.currentAccount = account;
    return true;
  }
}
