import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import ms from 'ms';
import { AuthCookie } from 'src/modules/auth/interfaces/jwt.interface';

@Injectable()
export class CookieService {
  private readonly isProduction: boolean;
  constructor(
    private readonly configService: ConfigService,
    private readonly logger = new Logger(CookieService.name),
  ) {
    this.isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';
  }

  setRefreshCookies(res: Response, refreshToken: string): void {
    const secure = this.isProduction;
    const sameSite: 'strict' | 'lax' | 'none' = secure ? 'strict' : 'lax';
    const expiry = this.configService.getOrThrow<ms.StringValue>(
      'REFRESH_TOKEN_EXPIRY',
    );

    try {
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        sameSite,
        secure,
        maxAge: ms(expiry),
        path: '/auth',
      });
    } catch (error) {
      this.logger.error(
        'Failed to set refresh token',
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        'An error occurred while establishing the session',
      );
    }
  }

  clearAuthCookies(res: Response) {
    try {
      res.clearCookie('refresh_token', {
        path: '/auth',
      });
    } catch (error) {
      this.logger.error(
        'Failed to clearing refresh token',
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        'An error occurred while clearing the session',
      );
    }
  }

  extractRefreshCookie(req: Request): string | null {
    const cookies = req.cookies as Partial<AuthCookie> | undefined;
    if (!cookies) {
      return null;
    }
    const refreshToken = cookies.refresh_token;
    if (!refreshToken || typeof refreshToken != 'string') {
      return null;
    }
    return refreshToken;
  }
}
