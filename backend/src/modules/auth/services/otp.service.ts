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

  /**
   *
   * @param sendOtpDto
   * @returns
   */
  // In production, integrate with an SMS gateway to send the OTP to the user's phone.
  async sendOtp(sendOtpDto: SendOtpDto): Promise<SendOtpResponse> {
    const phone = PhoneNumber.from(sendOtpDto.phone).value;
    const { deviceId } = sendOtpDto;

    const failureKey = this.otpFailureKey(phone);
    const failureCount = (await this.getSecurityValue<number>(failureKey)) ?? 0;

    if (failureCount >= this.OTP_MAX_FAILURES) {
      throw new TooManyRequestsException(
        'Too many invalid OTP attempts. Try again later.',
      );
    }

    const resendKey = this.otpResendKey(phone);
    const resendLockAcquired = await this.redisService.set(resendKey, true, {
      ttl: this.OTP_RESEND_COOLDOWN_SECONDS,
      nx: true,
    });

    if (!resendLockAcquired) {
      const existingResendLocker =
        await this.getSecurityValue<boolean>(resendKey);

      if (existingResendLocker) {
        throw new TooManyRequestsException(
          'Please wait before requesting another OTP.',
        );
      }

      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    const challengeId = randomUUID();
    const otp = randomInt(0, 1000000).toString().padStart(6, '0');
    const challenge: OtpChallenge = {
      phone,
      deviceId,
      code: challengeId,
    };

    const challengeKey = this.otpChallengeKey(challengeId);
    const activeChallengeKey = this.otpActiveChallengeKey(phone);

    const challengeStored = await this.redisService.set(
      challengeKey,
      challenge,
      {
        ttl: this.OTP_TTL,
      },
    );

    if (!challengeStored) {
      await this.redisService.del(resendKey);

      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    const activeChallengeStored = await this.redisService.set(
      activeChallengeKey,
      challengeId,
      { ttl: this.OTP_TTL },
    );

    if (!activeChallengeStored) {
      await this.redisService.del(challengeKey);
      await this.redisService.del(resendKey);

      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    if (this.isDevelopment) {
      const maskedPhone = phone.slice(-4);
      this.logger.debug(
        `[DEVELOPMENT ONLY] OTP for phone ending ${maskedPhone} is: ${otp}`,
      );
    }
    return {
      message: 'OTP sent successfully. It will expire in 3 minutes.',
      expiresIn: this.OTP_TTL,
      challengeId,
    };
  }

  // Verifies the OTP provided by the user
  async verifyOtp(VerifyOtpDto: VerifyOtpDto): Promise<VerifyOtpResponse> {
    const { otp, deviceId, challengeId } = VerifyOtpDto;

    const phone = PhoneNumber.from(VerifyOtpDto.phone).value;
    const failureKey = this.otpFailureKey(phone);
    const failureCount = (await this.getSecurityValue<number>(failureKey)) ?? 0;

    if (failureCount >= this.OTP_MAX_FAILURES) {
      throw new TooManyRequestsException(
        'Too many invalid OTP attempts. Try again later.',
      );
    }

    const activeChallengeKey = this.otpActiveChallengeKey(phone);
    const activeChallengeId =
      await this.getSecurityValue<string>(activeChallengeKey);

    if (!activeChallengeId || activeChallengeId !== challengeId) {
      throw new BadRequestException('Otp challenge is expired or surperseded');
    }

    const challenge = await this.getSecurityValue<OtpChallenge>(
      this.otpChallengeKey(challengeId),
    );

    if (!challenge) {
      throw new BadRequestException('OTP challenge is expired or unavailable.');
    }

    if (challenge.phone !== phone || challenge.deviceId !== deviceId) {
      throw new BadRequestException('Invalid OTP challenge');
    }

    if (challenge.code !== otp) {
      const updateFailureCount = await this.redisService.incrementWithTtl(
        failureKey,
        this.OTP_FAILURE_WINDOW_SECONDS,
      );

      if (updateFailureCount === null) {
        throw new ServiceUnavailableException(
          'Authentication service temporarily unavailable.',
        );
      }

      if (updateFailureCount >= this.OTP_MAX_FAILURES) {
        throw new TooManyRequestsException(
          'Too many invalid OTP attempts. Try again later.',
        );
      }

      throw new BadRequestException('Invalid OTP');
    }

    const challengeDeleted = await this.redisService.del(
      this.otpChallengeKey(challengeId),
    );

    if (!challengeDeleted) {
      throw new BadRequestException('OTP challenge is no longer valid.');
    }

    await this.redisService.del(failureKey);

    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
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

    // If user doesn't exist, set a clearance key in Redis to allow them to proceed to PIN setup
    // Without creating an account first. This key will have a TTL to prevent misuse.
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

  private async getSecurityValue<T>(key: string): Promise<T | null> {
    try {
      return await this.redisService.getStrict(key);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service temporary unavailable',
      );
    }
  }
}
