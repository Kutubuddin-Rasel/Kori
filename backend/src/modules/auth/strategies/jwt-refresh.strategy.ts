import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CookieService } from '../services/cookie.service';
import { JwtPayload } from 'src/modules/interfaces/jwt.interface';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { PasswordSerice } from '../services/password.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly cookieService: CookieService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordSerice,
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

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    const refreshToken = this.cookieService.extractRefreshCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const trustDevice = await this.prisma.trustDevice.findUnique({
      where: {
        deviceId: payload.deviceId,
      },
    });

    if (!trustDevice || !trustDevice.refreshTokenHash) {
      throw new UnauthorizedException('This is not a authorized device');
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
