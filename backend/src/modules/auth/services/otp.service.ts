import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import {
  OtpChallenge,
  OtpVerificationStatus,
  SendOtpResponse,
  VerifyOtpResponse,
} from '../interfaces/otp.interface';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { PhoneNumber } from 'src/domain/value-objects/phone-number.vo';
import { randomInt, randomUUID } from 'node:crypto';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { VERIFY_OTP_SCRIPT } from '../scripts/verify-otp.script';
import { AuthProofService } from './auth-proof.service';
import { AccountStatus } from 'generated/prisma/enums';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  // Configuration variables for OTP lifecycle and rate limiting
  private readonly OTP_TTL: number;
  private readonly OTP_RESEND_COOLDOWN_SECONDS: number;
  private readonly OTP_MAX_FAILURES: number;
  private readonly OTP_FAILURE_WINDOW_SECONDS: number;
  private readonly isDevelopment: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly authProofService: AuthProofService,
  ) {
    this.OTP_TTL = this.configService.getOrThrow<number>('OTP_TIME_LIMIT');
    this.OTP_RESEND_COOLDOWN_SECONDS = this.configService.getOrThrow<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
    );
    this.OTP_MAX_FAILURES =
      this.configService.getOrThrow<number>('OTP_MAX_FAILURES');
    this.OTP_FAILURE_WINDOW_SECONDS = this.configService.getOrThrow<number>(
      'OTP_FAILURE_WINDOW_SECONDS',
    );
    this.isDevelopment =
      this.configService.getOrThrow<string>('NODE_ENV') === 'development';
  }

  // Redis key generators for tracking different OTP states
  private otpChallengeKey(phone: string, chanllengeId: string): string {
    return `auth:otp:{${phone}}:challenge:${chanllengeId}`;
  }

  private otpActiveChallengeKey(phone: string): string {
    return `auth:otp:{${phone}}:active`;
  }

  private otpResendKey(phone: string): string {
    return `auth:otp:{${phone}}:resend`;
  }

  private otpFailureKey(phone: string): string {
    return `auth:otp:{${phone}}:failures`;
  }

  // Helper to fetch values from Redis with a fallback for connection errors
  private async getSecurityValue<T>(key: string): Promise<T | null> {
    try {
      return await this.redisService.getStrict(key);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service temporary unavailable',
      );
    }
  }

  // Generates and sends a new OTP while enforcing rate limits and cooldowns
  async sendOtp(sendOtpDto: SendOtpDto): Promise<SendOtpResponse> {
    const phone = PhoneNumber.from(sendOtpDto.phone).value;
    const { deviceId } = sendOtpDto;

    // Check if the user is currently locked out due to too many failed attempts
    const failureKey = this.otpFailureKey(phone);
    const failureCount = (await this.getSecurityValue<number>(failureKey)) ?? 0;

    if (failureCount >= this.OTP_MAX_FAILURES) {
      throw new TooManyRequestsException(
        'Too many invalid OTP attempts. Try again later.',
      );
    }

    // Try to set a cooldown lock. 'nx: true' ensures it only succeeds if the key doesn't exist.
    const resendKey = this.otpResendKey(phone);
    const resendLockAcquired = await this.redisService.set(resendKey, true, {
      ttl: this.OTP_RESEND_COOLDOWN_SECONDS,
      nx: true,
    });

    if (!resendLockAcquired) {
      // The lock failed. Verify if it's because they are actually on cooldown.
      const existingResendLocker =
        await this.getSecurityValue<boolean>(resendKey);

      if (existingResendLocker) {
        throw new TooManyRequestsException(
          'Please wait before requesting another OTP.',
        );
      }

      // If they aren't on cooldown but the lock failed, Redis is likely unavailable.
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    // Generate a unique challenge ID and a 6-digit OTP code
    const challengeId = randomUUID();
    const otp = randomInt(0, 1000000).toString().padStart(6, '0');
    const challenge: OtpChallenge = {
      phone,
      deviceId,
      code: otp,
    };

    const challengeKey = this.otpChallengeKey(phone, challengeId);
    const activeChallengeKey = this.otpActiveChallengeKey(phone);

    // Save the challenge details (phone, device, OTP code)
    const challengeStored = await this.redisService.set(
      challengeKey,
      challenge,
      {
        ttl: this.OTP_TTL,
      },
    );

    if (!challengeStored) {
      // Rollback cooldown lock if we fail to store the challenge
      await this.redisService.del(resendKey);

      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    // Track the most recent active challenge for this phone number
    // This invalidates any older OTPs that might still be unexpired
    const activeChallengeStored = await this.redisService.set(
      activeChallengeKey,
      challengeId,
      { ttl: this.OTP_TTL },
    );

    if (!activeChallengeStored) {
      // Rollback everything if we fail here
      await Promise.all([
        this.redisService.del(challengeKey),
        this.redisService.del(resendKey),
      ]);

      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    // In dev mode, log the OTP so we don't have to actually send an SMS
    if (this.isDevelopment) {
      const maskedPhone = phone.slice(-4);
      this.logger.debug(
        `[DEVELOPMENT ONLY] OTP for phone ending ${maskedPhone} is: ${otp}`,
      );
    }

    // TODO: In production, integrate with an SMS gateway here to send the OTP.
    return {
      message: 'OTP sent successfully. It will expire in 3 minutes.',
      expiresIn: this.OTP_TTL,
      challengeId,
    };
  }

  // Validates a user-provided OTP against the active challenge
  async verifyOtp(VerifyOtpDto: VerifyOtpDto): Promise<VerifyOtpResponse> {
    const { otp, deviceId, challengeId } = VerifyOtpDto;

    const phone = PhoneNumber.from(VerifyOtpDto.phone).value;

    const status = await this.verifyOtpAtomically(
      phone,
      deviceId,
      challengeId,
      otp,
    );

    switch (status) {
      case 'VERIFIED':
        break;
      case 'TOO_MANY_ATTEMPTS':
        throw new TooManyRequestsException(
          'Too many invalid OTP attempts. Try again later.',
        );
      case 'INVALID_OTP':
        throw new BadRequestException('Invalid OTP');
      case 'INVALID_CHALLENGE':
        throw new BadRequestException('Invalid OTP challenge');
      case 'NO_ACTIVE_CHALLENGE':
      case 'SUPERSEDED':
      case 'CHALLENGE_MISSING':
        throw new BadRequestException('OTP challenge is expired or superseded');
      default: {
        throw new InternalServerErrorException('Unexpected OTP state');
      }
    }

    // Handle post-verification logic (login vs registration)
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      const enrollmentToken = VerifyOtpDto.deviceEnrollmentToken;

      if (!enrollmentToken) {
        throw new ForbiddenException({
          code: 'DEVICE_ENROLLMENT_AUTHORIZATION_REQUIRED',
          message: 'Start device verification from login first.',
        });
      }
      if (existingUser.status !== AccountStatus.ACTIVE) {
        throw new ForbiddenException({
          code: 'ACCOUNT_RESTRICTED',

          message:
            'Your account is temporarily restricted. Please contact support.',
        });
      }

      const authorizationStatus =
        await this.authProofService.consumeDeviceEnrollmentAuthorization(
          existingUser.id,
          phone,
          deviceId,
          enrollmentToken,
        );

      if (authorizationStatus !== 'CONSUMED') {
        throw new ForbiddenException({
          code: 'DEVICE_ENROLLMENT_AUTHORIZATION_INVALID',

          message: 'Device verification authorization is invalid or expired.',
        });
      }

      await this.prisma.trustDevice.upsert({
        where: { userId_deviceId: { userId: existingUser.id, deviceId } },
        update: {
          isAuthorized: true,
          refreshSessionId: null,
          currentRefreshJti: null,
          lastUsedAt: new Date(),
        },
        create: {
          userId: existingUser.id,
          deviceId,
          isAuthorized: true,
          refreshSessionId: null,
          currentRefreshJti: null,
        },
      });
      return {
        message: 'Device verified. Please login again.',
        isRegistered: true,
      };
    }

    const authorization =
      await this.authProofService.issueRegistrationAuthorization(
        phone,
        deviceId,
      );

    return {
      message: 'Otp verified. Procced to PIN setup',
      isRegistered: false,
      registrationAuthorization: {
        token: authorization.token,
        expiresIn: authorization.expiresIn,
      },
    };
  }

  private async verifyOtpAtomically(
    phone: string,
    deviceId: string,
    challengeId: string,
    otp: string,
  ): Promise<OtpVerificationStatus> {
    try {
      const result = await this.redisService.evalScript(
        VERIFY_OTP_SCRIPT,
        [
          this.otpActiveChallengeKey(phone),
          this.otpChallengeKey(phone, challengeId),
          this.otpFailureKey(phone),
        ],
        [
          challengeId,
          phone,
          deviceId,
          otp,
          String(this.OTP_MAX_FAILURES),
          String(this.OTP_FAILURE_WINDOW_SECONDS),
        ],
      );

      if (!Array.isArray(result) || typeof result[0] !== 'string') {
        throw new Error('Unexpected OTP script result');
      }

      return result[0] as OtpVerificationStatus;
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }
  }
}
