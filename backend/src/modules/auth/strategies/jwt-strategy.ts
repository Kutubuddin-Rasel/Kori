import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AccessTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Call the super constructor with the JWT strategy options
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('ACCESSTOKEN_SECRET'),
    });
  }

  // This method is called by Passport to validate the JWT payload
  async validate(payload: AccessTokenPayload): Promise<AccessTokenPayload> {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }

    // Check if the user still exists in the database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exist');
    }
    return payload;
  }
}
