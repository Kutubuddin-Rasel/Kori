import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import ms from 'ms';
import { StringValue } from 'ms';
import { AuthCookie } from 'src/modules/interfaces/jwt.interface';

@Injectable()
export class CookieService {
  private readonly isProduction: boolean;
  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';
  }

  setAuthCookies(res: Response, refreshToken: string): void {
    const secure = this.isProduction;
    const sameSite: 'strict' | 'lax' | 'none' = secure ? 'strict' : 'lax';
    const expiry = this.configService.getOrThrow<StringValue>(
      'REFRESH_TOKEN_EXPIRY',
    );

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: ms(expiry),
      path: '/auth',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie('refresh_token', {
      path: '/auth',
    });
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
