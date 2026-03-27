import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CookieService } from '../services/cookie.service';
import { RefreshTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { PasswordService } from '../services/password.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly cookieService: CookieService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => this.cookieService.extractRefreshCookie(req),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: RefreshTokenPayload,
  ): Promise<RefreshTokenPayload> {
    const refreshToken = this.cookieService.extractRefreshCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const trustDevice = await this.prisma.trustDevice.findUnique({
      where: {
        deviceId: payload.deviceId,
      },
    });

    if (!trustDevice) {
      throw new UnauthorizedException('Unrecognized device');
    }

    if (!trustDevice.isAuthorized) {
      throw new UnauthorizedException(
        'Please device has been revoked. Please login again',
      );
    }

    if (!trustDevice.refreshTokenHash) {
      throw new UnauthorizedException(
        'No active session found for this device',
      );
    }

    const match = await this.passwordService.verify(
      refreshToken,
      trustDevice.refreshTokenHash,
    );

    if (!match) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return payload;
  }
}
