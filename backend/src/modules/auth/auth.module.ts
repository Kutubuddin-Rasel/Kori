import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './services/otp.service';
import { WalletsModule } from '../wallets/wallets.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PasswordService } from './services/password.service';
import { CookieService } from './services/cookie.service';
import { JwtStrategy } from './strategies/jwt-strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { AuthProofService } from './services/auth-proof.service';

@Module({
  imports: [WalletsModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    AuthProofService,
    PasswordService,
    CookieService,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
})
export class AuthModule {}
