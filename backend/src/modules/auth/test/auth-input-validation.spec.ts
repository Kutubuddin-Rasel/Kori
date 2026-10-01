import { validate } from 'class-validator';
import { AuthCredentialsDto } from '../dto/auth-credentials.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';

describe('Auth input validation', () => {
  it('rejects a non-numeric PIN when its length is valid', async () => {
    const dto = Object.assign(new AuthCredentialsDto(), {
      phone: '+8801712345678',
      pin: '12ab',
      deviceId: 'device-1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'pin')).toBe(true);
  });

  it.each(['1234', '12345'])('accepts numeric PIN', async (pin) => {
    const dto = Object.assign(new AuthCredentialsDto(), {
      phone: '+8801712345678',
      pin,
      deviceId: 'device-1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'pin')).toBe(false);
  });

  it('rejects a non-numeric OTP when its length is valid', async () => {
    const dto = Object.assign(new VerifyOtpDto(), {
      phone: '+8801712345678',
      challengeId: '00000000-0000-4000-8000-000000000001',
      otp: '12ab56',
      deviceId: 'device-1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'otp')).toBe(true);
  });

  it('accepts an OTP leading with zero', async () => {
    const dto = Object.assign(new VerifyOtpDto(), {
      phone: '+8801712345678',
      challengeId: '00000000-0000-4000-8000-000000000001',
      otp: '001234',
      deviceId: 'device-1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'otp')).toBe(false);
  });
});
