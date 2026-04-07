import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import {
  SendOtpResponse,
  TokenResponse,
  VerifyOtpResponse,
} from './interfaces/auth.interface';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { CookieService } from './services/cookie.service';
import type { Response } from 'express';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { RefreshTokenPayload } from './interfaces/jwt.interface';
import { OtpService } from './services/otp.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly cookieService: CookieService,
  ) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto): Promise<SendOtpResponse> {
    return this.otpService.sendOtp(sendOtpDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
  ): Promise<VerifyOtpResponse> {
    return this.otpService.verifyOtp(verifyOtpDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Res() res: Response,
    @Body() authCredentialDto: AuthCredentialsDto,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.register(authCredentialDto);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Res() res: Response,
    @Body() authCredentialDto: AuthCredentialsDto,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.login(authCredentialDto);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }

  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @CurrentUser() user: RefreshTokenPayload,
    @Res() res: Response,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.refreshTokens(user);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }
}
