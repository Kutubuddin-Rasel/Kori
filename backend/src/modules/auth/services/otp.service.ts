import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import {
  SendOtpResponse,
  VerifyOtpResponse,
} from '../interfaces/auth.interface';
import { VerifyOtpDto } from '../dto/verify-otp.dto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_TTL: number;
  private readonly CLEARANCE_TTL: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {
    this.OTP_TTL = configService.getOrThrow<number>('OTP_TIME_LIMIT');
    this.CLEARANCE_TTL = configService.getOrThrow<number>('CLEARANCE_TTL');
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<SendOtpResponse> {
    const { phone } = sendOtpDto;

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const redisKey = `otp:${phone}`;

    const result = await this.redisService.set<string>(redisKey, otp, {
      ttl: this.OTP_TTL,
    });

    if (!result) {
      throw new InternalServerErrorException(
        'Server error for setting otp cache',
      );
    }

    console.log(`[DEVELOPMENT ONLY] OTP for ${phone} is: ${otp}`);
    return {
      message: 'OTP sent successfully. It will expire in 3 minutes.',
      expiresIn: this.OTP_TTL,
    };
  }

  async verifyOtp(VerifyOtpDto: VerifyOtpDto): Promise<VerifyOtpResponse> {
    const { phone, otp, deviceId } = VerifyOtpDto;
    const redisKey = `otp:${phone}`;
    const storedOtp = await this.redisService.get<string>(redisKey);

    if (!storedOtp) {
      throw new BadRequestException('Otp expired or was never sent');
    }
    if (storedOtp != otp) {
      throw new BadRequestException('Invalid OTP');
    }
    await this.redisService.del(redisKey);

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

    const clearanceKey = `register_clearance:${phone}`;
    const result = await this.redisService.set(clearanceKey, 'GRANTED', {
      ttl: this.CLEARANCE_TTL,
    });
    if (!result) {
      throw new InternalServerErrorException(
        'Server error for setting clearnace key',
      );
    }

    return {
      message: 'Otp verified. Procced to PIN setup',
      isRegistered: false,
    };
  }
}
