import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { TokensResponse } from './interfaces/auth.interface';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { PasswordService } from './services/password.service';
import { RefreshTokenPayload } from './interfaces/jwt.interface';
import { JwtService } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { AccountStatus, User } from '../../../generated/prisma/client';
import { WalletsService } from '../wallets/wallets.service';
import { PhoneNumber } from 'src/domain/value-objects/phone-number.vo';
import { TooManyRequestsException } from './exceptions/too-many-requests.exception';
import { RegisterDto } from './dto/register.dto';
import { AuthProofService } from './services/auth-proof.service';
import { DeviceVerificationRequiredException } from './exceptions/device-verification-required.exception';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {

  constructor(
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly authProofService: AuthProofService,
  ) {}

  // --- Rate Limiting Key Generators ---

  private loginFailureKey(phone: string): string {
    return `auth:login:failures:${phone}`;
  }

  private loginThrottleKey(phone: string): string {
    return `auth:login:throttle:${phone}`;
  }

  // Safely fetch from Redis with a fallback if the connection drops
  private async getSecurityRedisValue<T>(key: string): Promise<T | null> {
    try {
      return await this.redisService.getStrict<T>(key);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }
  }

  // Check if a user is currently locked out from logging in
  private async assertLoginNotThrottled(phone: string): Promise<void> {
    const throttle = await this.getSecurityRedisValue<boolean>(
      this.loginThrottleKey(phone),
    );

    if (throttle) {
      throw new TooManyRequestsException(
        'Too many login attempts. Try again later.',
      );
    }
  }

  // Log a failed login attempt and lock the account if they hit the max limit
  private async recordLoginFailure(phone: string): Promise<void> {
    const maxFailures =
      this.configService.getOrThrow<number>('LOGIN_MAX_FAILURES');
    const failureWindow = this.configService.getOrThrow<number>(
      'LOGIN_FAILURE_WINDOW_SECONDS',
    );
    const throttleSeconds = this.configService.getOrThrow<number>(
      'LOGIN_THROTTLE_SECONDS',
    );

    // Bump the failure count
    const failureCount = await this.redisService.incrementWithTtl(
      this.loginFailureKey(phone),
      failureWindow,
    );

    if (failureCount === null) {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    // If they've exceeded the limit, set the throttle lock
    if (failureCount >= maxFailures) {
      const throttleStored = await this.redisService.set(
        this.loginThrottleKey(phone),
        true,
        { ttl: throttleSeconds },
      );

      if (!throttleStored) {
        throw new ServiceUnavailableException(
          'Authentication service temporarily unavailable.',
        );
      }

      throw new TooManyRequestsException(
        'Too many login attempts. Try again later.',
      );
    }
  }

  // Clear both the failure count and the throttle lock upon a successful login
  private async clearLoginFailureState(phone: string): Promise<void> {
    await Promise.all([
      this.redisService.del(this.loginFailureKey(phone)),
      this.redisService.del(this.loginThrottleKey(phone)),
    ]);
  }

  // --- Auth Core Logic ---

  // Completes the sign-up process for a new user
  async register(registerDto: RegisterDto): Promise<TokensResponse> {
    const { pin, deviceId, registrationToken } = registerDto;
    const phone = PhoneNumber.from(registerDto.phone).value;

    // 1. Do authorization check to confirm this user had done the otp verification
    const authorizationStatus =
      await this.authProofService.consumeRegistrationAuthorization(
        phone,
        deviceId,
        registrationToken,
      );

    if (authorizationStatus !== 'CONSUMED') {
      throw new UnauthorizedException({
        code: 'REGISTRATION_AUTHORIZATION_INVALID',
        message:
          'Registration authorization is invalid or expired. Verify your phone again.',
      });
    }

    // 2. Check the phone number isn't already taken
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ConflictException('Phone number is already registered.');
    }

    // 3. Hash their PIN for secure storage
    const hashPin = await this.passwordService.hash(pin);

    try {
      // 4. Wrap everything in a database transaction so we don't end up with partial accounts
      const tokens = await this.prisma.$transaction(async (tx) => {
        // Create the core user record
        const newUser = await tx.user.create({ data: { phone, pin: hashPin } });

        // Generate session and jwt id
        const sid = randomUUID();
        const jti = randomUUID();

        // Generate their initial JWT session tokens
        const { accessToken, refreshToken } = await this.getTokens(
          newUser,
          deviceId,
          sid,
          jti,
        );

        // Provision their initial wallet
        await this.walletsService.createPersonalWallet(tx, newUser.id);

        // Register the device they signed up on as a trusted device
        await tx.trustDevice.create({
          data: {
            userId: newUser.id,
            deviceId,
            isAuthorized: true,
            refreshSessionId: sid,
            currentRefreshJti: jti,
          },
        });

        return { accessToken, refreshToken };
      });

      return tokens;
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        'Failed to provide secure account',
      );
    }
  }

  // Authenticates an existing user and issues new session tokens
  async login(authCredentialDto: AuthCredentialsDto): Promise<TokensResponse> {
    const { deviceId, pin } = authCredentialDto;
    const phone = PhoneNumber.from(authCredentialDto.phone).value;

    // 1. Block brute force attempts right away
    await this.assertLoginNotThrottled(phone);

    // 2. Look up the user and their trusted devices
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { trustDevices: true },
    });

    if (!user) {
      await this.recordLoginFailure(phone);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Phone number or PIN is incorrect.',
      });
    }

    // 3. Verify the PIN matches the stored hash
    const isPinValid = await this.passwordService.verify(pin, user.pin);
    if (!isPinValid) {
      await this.recordLoginFailure(phone);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Phone number or PIN is incorrect.',
      });
    }

    // 4. Reset failure counters on a successful PIN match
    await this.clearLoginFailureState(phone);

    // 5. Check if the account is suspended or banned
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_RESTRICTED',
        message:
          'Your account is temporarily restricted. Please contact support.',
      });
    }

    // 6. Ensure they are logging in from a recognized device
    const trustedDevice = user.trustDevices.find(
      (device) => device.deviceId === deviceId,
    );

    if (!trustedDevice || !trustedDevice.isAuthorized) {
      const authorization =
        await this.authProofService.issueDeviceEnrollmentAuthorization(
          user.id,
          phone,
          deviceId,
        );

      throw new DeviceVerificationRequiredException(
        authorization.token,
        authorization.expiresIn,
      );
    }

    // 7. Issue new tokens and persist the refresh token hash
    const sid = randomUUID();
    const jti = randomUUID();
    const tokens = await this.getTokens(user, deviceId, sid, jti);

    const updated = await this.prisma.trustDevice.updateMany({
      where: {
        userId: user.id,
        deviceId,
        isAuthorized: true,
        user: { is: { status: AccountStatus.ACTIVE } },
      },
      data: {
        refreshSessionId: sid,
        currentRefreshJti: jti,
        lastUsedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new UnauthorizedException({
        code: 'SESSION_ESTABLISHMENT_FAILED',
        message: 'Unable to establish session. Please try again.',
      });
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // Reissues new tokens when the access token expires, provided a valid refresh token
  async refreshTokens(payload: RefreshTokenPayload): Promise<TokensResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'SESSION_INAVLID',
        message: 'Your session is no longer valid. Please sign in again.',
      });
    }

    const newJti = randomUUID();
    const newTokens = await this.getTokens(
      user,
      payload.deviceId,
      payload.sid,
      newJti,
    );

    // Rotate the refresh token in the database
    const result = await this.prisma.trustDevice.updateMany({
      where: {
        userId: payload.sub,
        deviceId: payload.deviceId,
        refreshSessionId: payload.sid,
        currentRefreshJti: payload.jti,
        isAuthorized: true,
        user: {
          is: {
            status: AccountStatus.ACTIVE,
          },
        },
      },
      data: {
        currentRefreshJti: newJti,
        lastUsedAt: new Date(),
      },
    });

    if (result.count === 1) {
      return newTokens;
    }

    const device = await this.prisma.trustDevice.findUnique({
      where: {
        userId_deviceId: { userId: payload.sub, deviceId: payload.deviceId },
      },
      select: {
        isAuthorized: true,
        refreshSessionId: true,
        currentRefreshJti: true,
      },
    });

    if (
      device?.isAuthorized &&
      device.refreshSessionId === payload.sid &&
      device.currentRefreshJti !== null
    ) {
      await this.prisma.trustDevice.updateMany({
        where: {
          userId: payload.sub,
          deviceId: payload.deviceId,
          refreshSessionId: payload.sid,
          isAuthorized: true,
          currentRefreshJti: {
            not: null,
          },
        },
        data: {
          refreshSessionId: null,
          currentRefreshJti: null,
        },
      });
    }

    throw new UnauthorizedException({
      code: 'SESSION_INVALID',
      message: 'Your session is no longer valid. Please sign in again.',
    });
  }

  // Generates both short-lived access tokens and longer-lived refresh tokens
  private async getTokens(
    user: Pick<User, 'id' | 'role'>,
    deviceId: string,
    sid: string,
    jti: string,
  ): Promise<TokensResponse> {
    // Generate both tokens concurrently for speed
    const [accessToken, refreshToken] = await Promise.all([
      // Access token: minimal payload (sub, role) to keep headers small
      this.jwtService.signAsync(
        { sub: user.id, role: user.role },
        {
          secret: this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
          expiresIn: this.configService.getOrThrow<StringValue>(
            'ACCESS_TOKEN_EXPIRY',
          ),
          algorithm: 'HS256',
        },
      ),
      // Refresh token: includes sessionId, deviceId, and JWT ID so we know exactly which session to refresh
      this.jwtService.signAsync(
        {
          sub: user.id,
          deviceId,
          sid,
          jti,
          tokenUse: 'refresh',
        },
        {
          secret: this.configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
          expiresIn: this.configService.getOrThrow<StringValue>(
            'REFRESH_TOKEN_EXPIRY',
          ),
          algorithm: 'HS256',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
