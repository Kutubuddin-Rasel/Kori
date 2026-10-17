import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { TokenResponse } from './interfaces/auth.interface';
import { SendOtpResponse, VerifyOtpResponse } from './interfaces/otp.interface';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { CookieService } from './services/cookie.service';
import type { Request, Response } from 'express';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { RefreshTokenPayload } from './interfaces/jwt.interface';
import { OtpService } from './services/otp.service';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { ActiveAccountGuard } from './guards/active-account.guard';
import { TrustedDeviceResponse } from './interfaces/trusted-device-response.interface';
import { UserId } from 'src/domain/value-objects/user-id.vo';
import { DeviceIdParam } from './dto/device-id-param.dto';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from 'generated/prisma/enums';
import { ApproveBusinessDto } from './dto/approve-business.dto';
import { ApproveBusinessAccountResponse } from './interfaces/business-account.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly cookieService: CookieService,
  ) {}

  // Endpoint to send OTP to the user's phone number
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto): Promise<SendOtpResponse> {
    return this.otpService.sendOtp(sendOtpDto);
  }

  // Endpoint to verify the OTP entered by the user
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
  ): Promise<VerifyOtpResponse> {
    return this.otpService.verifyOtp(verifyOtpDto);
  }

  // Endpoint for user registration using phone number and PIN
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Res({ passthrough: true }) res: Response,
    @Body() registerDto: RegisterDto,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.register(registerDto);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }

  // Endpoint for user login using phone number and PIN
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Res({ passthrough: true }) res: Response,
    @Body() authCredentialDto: AuthCredentialsDto,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.login(authCredentialDto);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }

  // Endpoint to refresh access token using a valid refresh token
  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @CurrentUser() user: RefreshTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.refreshTokens(user);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = this.cookieService.extractRefreshCookie(req);
    await this.authService.logoutUsingRefreshCookie(rawToken);
    this.cookieService.clearAuthCookies(res);
  }

  @Get('devices')
  @UseGuards(AccessTokenGuard, ActiveAccountGuard)
  @HttpCode(HttpStatus.OK)
  async getMyDevices(
    @CurrentUser('sub') rawUserId: string,
  ): Promise<TrustedDeviceResponse[]> {
    const userId = UserId.from(rawUserId);
    return this.authService.listTrustedDevice(userId);
  }

  @Delete('devices/:deviceRecordId')
  @UseGuards(AccessTokenGuard, ActiveAccountGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeDevice(
    @CurrentUser('sub') rawUserId: string,
    @Param() params: DeviceIdParam,
  ): Promise<void> {
    const userId = UserId.from(rawUserId);
    await this.authService.revokeTrustedDevice(userId, params.deviceRecordId);
  }

  @Post('register-business')
  @HttpCode(HttpStatus.CREATED)
  async registerBusiness(
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RegisterDto,
  ): Promise<TokenResponse> {
    const { accessToken, refreshToken } =
      await this.authService.registerBusiness(dto);
    this.cookieService.setRefreshCookies(res, refreshToken);
    return { accessToken };
  }

  @Post('business-approvals')
  @UseGuards(AccessTokenGuard, ActiveAccountGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async approveBusiness(
    @CurrentUser('sub') rawAdminUserId: string,
    @Body() dto: ApproveBusinessDto,
  ): Promise<ApproveBusinessAccountResponse> {
    const adminUserId = UserId.from(rawAdminUserId);
    return await this.authService.approveBusinessAccount(adminUserId, dto);
  }
}
