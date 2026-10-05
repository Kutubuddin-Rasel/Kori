import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import {
  AuthorizationConsumeStatus,
  DeviceEnrollmentAuthorizationState,
  IssuedAuthorization,
  RegistrationAuthorizationState,
} from '../interfaces/auth-proof.interface';
import { createHash, randomBytes } from 'crypto';
import { CONSUME_REGISTRATION_AUTHORIZATION_SCRIPT } from '../scripts/consume-registration-authorization.script';
import { CONSUME_DEVICE_ENROLLMENT_AUTHORIZATION_SCRIPT } from '../scripts/consume-device-enrollment-authorization.script';

@Injectable()
export class AuthProofService {
  private readonly registrationTtl: number;
  private readonly deviceEnrollmentTtl: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.registrationTtl = this.configService.getOrThrow<number>(
      'REGISTRATION_AUTHORIZATION_TTL_SECONDS',
    );
    this.deviceEnrollmentTtl = this.configService.getOrThrow<number>(
      'DEVICE_ENROLLMENT_AUTHORIZATION_TTL_SECONDS',
    );
  }

  private registrationAuthorizationKey(phone: string): string {
    return `auth:registration:{${phone}}:authorization`;
  }

  private deviceEnrollmentAuthorizationKey(phone: string): string {
    return `auth:device-enrollment:{${phone}}:authorization`;
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async consumeAuthorization(
    script: string,
    key: string,
    args: string[],
  ): Promise<AuthorizationConsumeStatus> {
    let result: unknown;
    try {
      result = await this.redisService.evalScript(script, [key], args);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    if (!Array.isArray(result) || typeof result[0] !== 'string') {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    const status = result[0] as AuthorizationConsumeStatus;

    if (status !== 'CONSUMED' && status !== 'INVALID' && status !== 'MISSING') {
      throw new ServiceUnavailableException(
        'Unexpected authorization proof state.',
      );
    }

    return status;
  }

  async issueRegistrationAuthorization(
    phone: string,
    deviceId: string,
  ): Promise<IssuedAuthorization> {
    const token = this.generateToken();

    const state: RegistrationAuthorizationState = {
      tokenHash: this.hashToken(token),
      phone,
      deviceId,
    };

    const stored = await this.redisService.set(
      this.registrationAuthorizationKey(phone),
      state,
      { ttl: this.registrationTtl },
    );

    if (!stored) {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable',
      );
    }

    return { token, expiresIn: this.registrationTtl };
  }

  async consumeRegistrationAuthorization(
    phone: string,
    deviceId: string,
    token: string,
  ): Promise<AuthorizationConsumeStatus> {
    return this.consumeAuthorization(
      CONSUME_REGISTRATION_AUTHORIZATION_SCRIPT,
      this.registrationAuthorizationKey(phone),
      [this.hashToken(token), phone, deviceId],
    );
  }

  async issueDeviceEnrollmentAuthorization(
    userId: string,
    phone: string,
    deviceId: string,
  ): Promise<IssuedAuthorization> {
    const token = this.generateToken();

    const state: DeviceEnrollmentAuthorizationState = {
      tokenHash: this.hashToken(token),
      phone,
      userId,
      deviceId,
    };

    const stored = await this.redisService.set(
      this.deviceEnrollmentAuthorizationKey(phone),
      state,
      { ttl: this.deviceEnrollmentTtl },
    );

    if (!stored) {
      throw new ServiceUnavailableException(
        'Authentication service temporarily unavailable.',
      );
    }

    return { token, expiresIn: this.deviceEnrollmentTtl };
  }

  async consumeDeviceEnrollmentAuthorization(
    userId: string,
    phone: string,
    deviceId: string,
    token: string,
  ): Promise<AuthorizationConsumeStatus> {
    return this.consumeAuthorization(
      CONSUME_DEVICE_ENROLLMENT_AUTHORIZATION_SCRIPT,
      this.deviceEnrollmentAuthorizationKey(phone),
      [this.hashToken(token), userId, phone, deviceId],
    );
  }
}
