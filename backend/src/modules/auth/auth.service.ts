import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  TokensResponse,
  SendOtpResponse,
  VerifyOtpResponse,
} from './interfaces/auth.interface';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { PasswordService } from './services/password.service';
import { RefreshTokenPayload } from './interfaces/jwt.interface';
import { JwtService } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { User } from 'generated/prisma/browser';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class AuthService {
  private OTP_TTL: number;
  private CLEARANCE_TTL: number;
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly passwordSerivce: PasswordService,
    private readonly jwtService: JwtService,
    private readonly logger = new Logger(AuthService.name),
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

  private getPayload(user: User, deviceId: string): RefreshTokenPayload {
    const payload: RefreshTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      deviceId,
    };
    return payload;
  }

  async register(
    authCredentialDto: AuthCredentialsDto,
  ): Promise<TokensResponse> {
    const { phone, pin, deviceId } = authCredentialDto;

    const clearanceKey = `register_clearance:${phone}`;
    const hasClearance = await this.redisService.get(clearanceKey);
    if (!hasClearance) {
      throw new UnauthorizedException(
        'Session expired. Please request for a new otp',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });
    if (existingUser) {
      throw new ConflictException('Phone number is already registered.');
    }

    const hashPin = await this.passwordSerivce.hash(pin);

    try {
      const tokens = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({ data: { phone, pin: hashPin } });

        const { accessToken, refreshToken } = await this.getTokens(
          this.getPayload(newUser, deviceId),
        );

        const refreshTokenHash = await this.passwordSerivce.hash(refreshToken);

        await tx.wallet.create({
          data: { userId: newUser.id, type: 'PERSONAL', balance: 0 },
        });

        await tx.trustDevice.create({
          data: {
            userId: newUser.id,
            deviceId,
            refreshTokenHash,
            isAuthorized: true,
          },
        });

        return { accessToken, refreshToken };
      });

      await this.redisService.del(clearanceKey);

      return tokens;
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        'Failed to provide secure account',
      );
    }
  }

  async login(authCredentialDto: AuthCredentialsDto): Promise<TokensResponse> {
    const { phone, deviceId, pin } = authCredentialDto;

    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { trustDevices: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid phone number');
    }

    const isPinValid = await this.passwordSerivce.verify(pin, user.pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Invalid pin number');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        `Account is currently ${user.status}. Please contact support`,
      );
    }

    const isDeviceTrusted = user.trustDevices.some(
      (device) => device.deviceId === deviceId,
    );
    if (!isDeviceTrusted) {
      throw new ForbiddenException('UNRECOGNIZED_DEVICE');
    }
    const tokens = await this.getTokens(this.getPayload(user, deviceId));
    await this.updateRefreshToken(deviceId, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async updateRefreshToken(
    deviceId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      const refreshTokenHash = await this.passwordSerivce.hash(refreshToken);

      await this.prisma.trustDevice.update({
        where: { deviceId },
        data: { refreshTokenHash },
      });
    } catch (error) {
      this.logger.error(
        'Failed to update refresh token',
        error instanceof Error ? error.stack : error,
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const primsmaRecordToUpdateNotFoundCode = 'P2025';
        if (error.code === primsmaRecordToUpdateNotFoundCode) {
          throw new UnauthorizedException(
            'This device is not found in trust device',
          );
        }
      }

      throw new InternalServerErrorException(
        'An error ocured while refreshing session',
      );
    }
  }

  async refreshTokens(payload: RefreshTokenPayload): Promise<TokensResponse> {
    try {
      const tokens = await this.getTokens(payload);
      await this.updateRefreshToken(payload.deviceId, tokens.refreshToken);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      this.logger.error(
        'Failed to refresh tokens',
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException('An error occured while refresh');
    }
  }

  private async getTokens(
    payload: RefreshTokenPayload,
  ): Promise<TokensResponse> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: payload.sub, role: payload.role },
        {
          secret: this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
          expiresIn: this.configService.getOrThrow<StringValue>(
            'ACCESS_TOKEN_EXPIRY',
          ),
        },
      ),
      this.jwtService.signAsync(
        {
          sub: payload.sub,
          phone: payload.phone,
          role: payload.role,
          deviceId: payload.deviceId,
        },
        {
          secret: this.configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
          expiresIn: this.configService.getOrThrow<StringValue>(
            'REFRESH_TOKEN_EXPIRY',
          ),
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
    };
  }
}
