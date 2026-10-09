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
  /**
   * RFC 4122 Section 4.4 (UUID Version 4) Validator
   * Matches: 8 hex - 4 hex - 4 hex (starts with 4) - 4 hex (starts with 8, 9, a, or b) - 12 hex
   */
  private UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  private isUuidV4(value: unknown): value is string {
    return typeof value === 'string' && this.UUID_V4_REGEX.test(value);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  // The validate method is called by Passport ONLY AFTER the HMAC-SHA256 signature is verified
  validate(payload: unknown): RefreshTokenPayload {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const value = payload as Record<string, unknown>;

    // 1. Structural check: tokenUse discriminator
    if (value.tokenUse !== 'refresh') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    // 2. Structural check: deviceId format
    if (!this.isNonEmptyString(value.deviceId) || value.deviceId.length > 128) {
      throw new UnauthorizedException('Invalid device identifier in token');
    }

    // 3. Cryptographic UUID v4 syntax validation for sub, sid, and jti
    if (
      !this.isUuidV4(value.sub) ||
      !this.isUuidV4(value.sid) ||
      !this.isUuidV4(value.jti)
    ) {
      throw new UnauthorizedException(
        'Malformed token cryptographic identifiers',
      );
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
