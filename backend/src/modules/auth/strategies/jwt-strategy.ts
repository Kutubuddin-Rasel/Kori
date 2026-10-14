import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from 'src/domain/enums';
import { AccessTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';
import {
  isNonEmptyString,
  isUuidV4,
} from '../utils/parse-refresh-token-claims';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly ALLOWED_ROLES = new Set<string>(Object.values(Role));

  constructor(configService: ConfigService) {
    // Call the super constructor with the JWT strategy options
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
      algorithms: ['HS256'],
    });
  }

  private isRole(value: unknown): value is Role {
    return typeof value === 'string' && this.ALLOWED_ROLES.has(value);
  }

  // This method is called by Passport to validate the JWT payload
  validate(payload: unknown): AccessTokenPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const value = payload as Record<string, unknown>;

    if (!isNonEmptyString(value.sub) || !isUuidV4(value.sub)) {
      throw new UnauthorizedException(
        'Malformed token cryptographic identifiers',
      );
    }

    if (!this.isRole(value.role)) {
      throw new UnauthorizedException('Invalid or missing user role in token');
    }

    return {
      sub: value.sub,
      role: value.role,
    };
  }
}
