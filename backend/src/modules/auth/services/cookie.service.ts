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
    // Determine if the application is running in production
    this.isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';
  }

  // Sets the refresh token in an HTTP-only cookie with appropriate security settings.
  setRefreshCookies(res: Response, refreshToken: string): void {
    // Determine if the application is running in production to set secure cookie attributes.
    const secure = this.isProduction;
    const sameSite: 'strict' | 'lax' | 'none' = secure ? 'strict' : 'lax';
    // Retrieve the refresh token expiry time from the configuration, ensuring it is defined.
    const expiry = this.configService.getOrThrow<ms.StringValue>(
      'REFRESH_TOKEN_EXPIRY',
    );

    try {
      // Set the refresh token cookie with security attributes and expiration time.
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
    // Clear the refresh token cookie by setting it to an empty value and specifying the same path.
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
    // Extract the refresh token from the cookies in the request
    const cookies = req.cookies as Partial<AuthCookie> | undefined;
    if (!cookies) {
      return null;
    }
    // Validate that the refresh token exists and is a string before returning it.
    const refreshToken = cookies.refresh_token;
    if (!refreshToken || typeof refreshToken != 'string') {
      return null;
    }
    return refreshToken;
  }
}
