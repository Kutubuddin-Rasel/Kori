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
  private logger = new Logger(CookieService.name);
  private readonly refreshCookiePath = '/api/v1/auth';
  private secure: boolean;
  private sameSite: 'strict' | 'lax' | 'none';

  constructor(private readonly configService: ConfigService) {
    // Determine if the application is running in production
    this.isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';
    // Determine if the application is running in production to set secure cookie attributes.
    this.secure = this.isProduction;
    this.sameSite = this.secure ? 'strict' : 'lax';
  }

  // Sets the refresh token in an HTTP-only cookie with appropriate security settings.
  setRefreshCookies(res: Response, refreshToken: string): void {
    // Retrieve the refresh token expiry time from the configuration, ensuring it is defined.
    const expiry = this.configService.getOrThrow<ms.StringValue>(
      'REFRESH_TOKEN_EXPIRY',
    );

    try {
      // Set the refresh token cookie with security attributes and expiration time.
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        sameSite: this.sameSite,
        secure: this.secure,
        maxAge: ms(expiry),
        path: this.refreshCookiePath,
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
        httpOnly: true,
        sameSite: this.sameSite,
        secure: this.secure,
        path: this.refreshCookiePath,
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
