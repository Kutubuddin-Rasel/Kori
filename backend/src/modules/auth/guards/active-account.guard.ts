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
import {
  CurrentAccountPayload,
  CurrentAccountRequest,
} from '../interfaces/active-account.interface';
import { AccountStatus } from 'generated/prisma/enums';

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
    let account: CurrentAccountPayload | null = null;

    try {
      account = await this.prisma.user.findUnique({
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

    if (!account) {
      throw new UnauthorizedException('User account not found.');
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        'Your account is currently restricted. Please contact support.',
      );
    }

    request.currentAccount = {
      id: account.id,
      role: account.role,
      status: account.status,
    };

    return true;
  }
}
