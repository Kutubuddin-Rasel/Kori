import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CookieService } from '../services/cookie.service';
import { RefreshTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';
import { Injectable, UnauthorizedException } from '@nestjs/common';

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
      passReqToCallback: true,
      algorithms: ['HS256'],
    });
  }

  // The validate method is called by Passport to validate the Refresh JWT payload
  validate(payload: unknown): RefreshTokenPayload {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const value = payload as Record<string, unknown>;

    if (
      typeof value.sub !== 'string' ||
      typeof value.deviceId !== 'string' ||
      typeof value.sid !== 'string' ||
      typeof value.jti !== 'string' ||
      !value.sub ||
      !value.deviceId ||
      !value.sid ||
      !value.jti ||
      value.tokenUse !== 'refresh'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      sub: value.sub,
      deviceId: value.deviceId,
      sid: value.sid,
      jti: value.jti,
      tokenUse: 'refresh',
    };
  }
}
