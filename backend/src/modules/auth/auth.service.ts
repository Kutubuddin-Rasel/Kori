import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpResponse } from '../interfaces/auth.interface';

@Injectable()
export class AuthService {
  private OTP_TTL: number;
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.OTP_TTL = this.configService.getOrThrow<number>('OTP_TIME_LIMIT');
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<OtpResponse> {
    const { phone } = sendOtpDto;

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const redisKey = `otp:${phone}`;

    const result = await this.redisService.set<string>(redisKey, otp, {
      ttl: this.OTP_TTL,
    });

    if (!result) {
      throw new InternalServerErrorException('Error while setting otp cache');
    }

    console.log(`[DEVELOPMENT ONLY] OTP for ${phone} is: ${otp}`);
    return {
      message: 'OTP sent successfully. It will expire in 3 minutes.',
      expiresIn: this.OTP_TTL,
    };
  }

  async verifyOtp(VerifyOtpDto: VerifyOtpDto): Promise<OtpResponse> {
    const { phone, otp } = VerifyOtpDto;
    const redisKey = `otp:${phone}`;
    const storedOtp = await this.redisService.get<string>(redisKey);

    if (!storedOtp) {
      throw new BadRequestException('Otp expired or was never sent');
    }
    if (storedOtp != otp) {
      throw new BadRequestException('Invalid OTP');
    }
    await this.redisService.del(redisKey);

    return {
      message: 'Phone number verified successfully.',
    };
  }
}
