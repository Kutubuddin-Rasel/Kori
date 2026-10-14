import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CookieService } from '../services/cookie.service';
import { RefreshTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { parseRefreshTokenClaims } from '../utils/parse-refresh-token-claims';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService, cookieService: CookieService) {
    // Call the super constructor with the appropriate options for the JWT Refresh strategy
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => cookieService.extractRefreshCookie(req),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
      algorithms: ['HS256'],
    });
  }

  // The validate method is called by Passport ONLY AFTER the HMAC-SHA256 signature is verified
  validate(payload: unknown): RefreshTokenPayload {
    const claims = parseRefreshTokenClaims(payload);

    if (!claims) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Invalid refresh token.',
      });
    }

    return claims;
  }
}
