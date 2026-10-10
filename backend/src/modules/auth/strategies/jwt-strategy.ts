import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from 'src/domain/enums';
import { AccessTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  private isUuidV4(value: unknown): value is string {
    return typeof value === 'string' && this.UUID_V4_REGEX.test(value);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isRole(value: unknown): value is Role {
    return typeof value === 'string' && this.ALLOWED_ROLES.has(value);
  }

  // This method is called by Passport to validate the JWT payload
  validate(payload: unknown): AccessTokenPayload {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Invalid access token');
    }

    const value = payload as Record<string, unknown>;

    if (!this.isNonEmptyString(value.sub) || !this.isUuidV4(value.sub)) {
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
