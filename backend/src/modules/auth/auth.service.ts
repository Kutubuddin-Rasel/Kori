import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import { User } from 'generated/prisma/browser';
import { Prisma } from 'generated/prisma/client';
import { WalletsService } from '../wallets/wallets.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly passwordSerivce: PasswordService,
    private readonly jwtService: JwtService,
    private readonly logger = new Logger(AuthService.name),
  ) {}

  // Get payload for JWT token
  private getPayload(user: User, deviceId: string): RefreshTokenPayload {
    const payload: RefreshTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      deviceId,
    };
    return payload;
  }

  // Register new user
  async register(
    authCredentialDto: AuthCredentialsDto,
  ): Promise<TokensResponse> {
    const { phone, pin, deviceId } = authCredentialDto;

    // Check if user has clearance to register
    const clearanceKey = `register_clearance:${phone}`;
    const hasClearance = await this.redisService.get(clearanceKey);
    if (!hasClearance) {
      throw new UnauthorizedException(
        'Session expired. Please request for a new otp',
      );
    }

    // Check if user is already registered
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });
    if (existingUser) {
      throw new ConflictException('Phone number is already registered.');
    }

    // Hash the PIN
    const hashPin = await this.passwordSerivce.hash(pin);

    try {
      const tokens = await this.prisma.$transaction(async (tx) => {
        // Create new user
        const newUser = await tx.user.create({ data: { phone, pin: hashPin } });

        // Generate tokens
        const { accessToken, refreshToken } = await this.getTokens(
          this.getPayload(newUser, deviceId),
        );

        // Hash the refresh token
        const refreshTokenHash = await this.passwordSerivce.hash(refreshToken);

        // Create wallet for new user
        await this.walletsService.createPersonalWallet(tx, newUser.id);

        // Register this device as Trust Device
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

      // Delete the clearance key
      await this.redisService.del(clearanceKey);

      return tokens;
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        'Failed to provide secure account',
      );
    }
  }

  // Login user
  async login(authCredentialDto: AuthCredentialsDto): Promise<TokensResponse> {
    const { phone, deviceId, pin } = authCredentialDto;

    // Check if user is registered
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { trustDevices: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid phone number');
    }

    // Verify PIN
    const isPinValid = await this.passwordSerivce.verify(pin, user.pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Invalid pin number');
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        `Account is currently ${user.status}. Please contact support`,
      );
    }

    // Check if device is trusted
    const isDeviceTrusted = user.trustDevices.some(
      (device) => device.deviceId === deviceId,
    );
    if (!isDeviceTrusted) {
      throw new ForbiddenException('UNRECOGNIZED_DEVICE');
    }

    // Generate tokens
    const tokens = await this.getTokens(this.getPayload(user, deviceId));

    // Update refresh token
    await this.updateRefreshToken(deviceId, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // Update refresh token
  private async updateRefreshToken(
    deviceId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      const refreshTokenHash = await this.passwordSerivce.hash(refreshToken);

      // Update refresh token
      await this.prisma.trustDevice.update({
        where: { deviceId },
        data: { refreshTokenHash },
      });
    } catch (error) {
      this.logger.error(
        'Failed to update refresh token',
        error instanceof Error ? error.stack : error,
      );

      // Check if device is not found
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

  // Refresh tokens
  async refreshTokens(payload: RefreshTokenPayload): Promise<TokensResponse> {
    try {
      // Generate tokens
      const tokens = await this.getTokens(payload);

      // Update refresh token
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

  // Generate tokens
  private async getTokens(
    payload: RefreshTokenPayload,
  ): Promise<TokensResponse> {
    // Generate Access and Refresh token
    const [accessToken, refreshToken] = await Promise.all([
      // Generate Access token
      this.jwtService.signAsync(
        { sub: payload.sub, role: payload.role },
        {
          secret: this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
          expiresIn: this.configService.getOrThrow<StringValue>(
            'ACCESS_TOKEN_EXPIRY',
          ),
        },
      ),
      // Generate Refresh token
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
