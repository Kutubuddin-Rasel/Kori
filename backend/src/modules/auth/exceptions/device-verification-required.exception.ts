import { ForbiddenException } from '@nestjs/common';

export class DeviceVerificationRequiredException extends ForbiddenException {
  constructor(token: string, expiresIn: number) {
    super({
      code: 'DEVICE_VERIFICATION_REQUIRED',
      message: 'Verify this device to continue.',
      details: {
        deviceEnrollmentToken: token,
        expiresIn,
      },
    });
  }
}
