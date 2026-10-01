import {
  BadRequestException,
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
  SendOtpResponse,
  VerifyOtpResponse,
} from '../interfaces/otp.interface';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { PhoneNumber } from 'src/domain/value-objects/phone-number.vo';
import { randomInt, randomUUID } from 'node:crypto';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  // Configuration variables for OTP lifecycle and rate limiting
  private readonly OTP_TTL: number;
  private readonly CLEARANCE_TTL: number;
  private readonly OTP_RESEND_COOLDOWN_SECONDS: number;
  private readonly OTP_MAX_FAILURES: number;
  private readonly OTP_FAILURE_WINDOW_SECONDS: number;
  private readonly isDevelopment: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {
    this.OTP_TTL = this.configService.getOrThrow<number>('OTP_TIME_LIMIT');
    this.CLEARANCE_TTL = this.configService.getOrThrow<number>('CLEARANCE_TTL');
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
  private registerClearanceKey(phone: string): string {
    return `register_clearance:${phone}`;
  }

  private otpChallengeKey(chanllengeId: string): string {
    return `auth:otp:challenge:${chanllengeId}`;
  }

  private otpActiveChallengeKey(phone: string): string {
    return `auth:otp:active:${phone}`;
  }

  private otpResendKey(phone: string): string {
    return `auth:otp:resend:${phone}`;
  }

  private otpFailureKey(phone: string): string {
    return `auth:otp:failures:${phone}`;
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

    const challengeKey = this.otpChallengeKey(challengeId);
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

    // 1. Check for brute force lockouts first
    const failureKey = this.otpFailureKey(phone);
    const failureCount = (await this.getSecurityValue<number>(failureKey)) ?? 0;

    if (failureCount >= this.OTP_MAX_FAILURES) {
      throw new TooManyRequestsException(
        'Too many invalid OTP attempts. Try again later.',
      );
    }

    // 2. Make sure they are verifying the most recently requested OTP
    const activeChallengeKey = this.otpActiveChallengeKey(phone);
    const activeChallengeId =
      await this.getSecurityValue<string>(activeChallengeKey);

    if (!activeChallengeId || activeChallengeId !== challengeId) {
      throw new BadRequestException('Otp challenge is expired or superseded');
    }

    // 3. Fetch the actual challenge details
    const challenge = await this.getSecurityValue<OtpChallenge>(
      this.otpChallengeKey(challengeId),
    );

    if (!challenge) {
      throw new BadRequestException('OTP challenge is expired or unavailable.');
    }

    // 4. Verify the challenge belongs to the requester
    if (challenge.phone !== phone || challenge.deviceId !== deviceId) {
      throw new BadRequestException('Invalid OTP challenge');
    }

    // 5. Verify the actual OTP code
    if (challenge.code !== otp) {
      // Record the failed attempt
      const updateFailureCount = await this.redisService.incrementWithTtl(
        failureKey,
        this.OTP_FAILURE_WINDOW_SECONDS,
      );

      if (updateFailureCount === null) {
        throw new ServiceUnavailableException(
          'Authentication service temporarily unavailable.',
        );
      }

      // Lock them out immediately if they hit the limit
      if (updateFailureCount >= this.OTP_MAX_FAILURES) {
        throw new TooManyRequestsException(
          'Too many invalid OTP attempts. Try again later.',
        );
      }

      throw new BadRequestException('Invalid OTP');
    }

    // 6. OTP is correct - cleanup the challenge to prevent replay attacks
    const challengeDeleted = await this.redisService.del(
      this.otpChallengeKey(challengeId),
    );

    if (!challengeDeleted) {
      throw new BadRequestException('OTP challenge is no longer valid.');
    }

    // Reset failure count since they successfully authenticated
    await this.redisService.del(failureKey);

    // 7. Handle post-verification logic (login vs registration)
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      // Returning user: authorize this device for them
      await this.prisma.trustDevice.upsert({
        where: { deviceId },
        update: { createdAt: new Date(), isAuthorized: true },
        create: { userId: existingUser.id, deviceId, isAuthorized: true },
      });

      return {
        message: 'Otp verified. User already exists. Please login',
        isRegistered: true,
      };
    }

    // New user: grant them a temporary clearance to proceed with registration (e.g. PIN setup)
    // This allows the next step without requiring a full account yet.
    const clearanceKey = this.registerClearanceKey(phone);
    const result = await this.redisService.set(clearanceKey, 'GRANTED', {
      ttl: this.CLEARANCE_TTL,
    });

    if (!result) {
      throw new InternalServerErrorException(
        'Server error for setting clearance key',
      );
    }

    return {
      message: 'Otp verified. Procced to PIN setup',
      isRegistered: false,
    };
  }
}
