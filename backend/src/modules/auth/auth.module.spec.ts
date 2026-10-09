import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from 'src/infrastructure/prisma/prisma.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { AuthModule } from './auth.module';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './services/otp.service';
import { PasswordService } from './services/password.service';
import { CookieService } from './services/cookie.service';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt-strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { Test } from '@nestjs/testing';

describe('AuthModule compositon', () => {
  it('resolve the Auth dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',

              ACCESS_TOKEN_SECRET: 'test-access-secret',
              REFRESH_TOKEN_SECRET: 'test-refresh-secret',

              ACCESS_TOKEN_EXPIRY: '15m',
              REFRESH_TOKEN_EXPIRY: '7d',

              OTP_TIME_LIMIT: 180,
              OTP_RESEND_COOLDOWN_SECONDS: 60,
              OTP_MAX_FAILURES: 10,
              OTP_FAILURE_WINDOW_SECONDS: 600,
              LOGIN_MAX_FAILURES: 5,
              LOGIN_FAILURE_WINDOW_SECONDS: 900,
              LOGIN_THROTTLE_SECONDS: 60,
            }),
          ],
        }),
        PrismaModule,
        RedisModule,
        AuthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({})
      .compile();

    expect(moduleRef.get(AuthController)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(OtpService)).toBeDefined();
    expect(moduleRef.get(PasswordService)).toBeDefined();
    expect(moduleRef.get(CookieService)).toBeDefined();
    expect(moduleRef.get(JwtService)).toBeDefined();
    expect(moduleRef.get(JwtStrategy)).toBeDefined();
    expect(moduleRef.get(JwtRefreshStrategy)).toBeDefined();

    await moduleRef.close();
  });
});
