import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { CookieService } from '../services/cookie.service';

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;
  const configServiceStub = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'REFRESH_TOKEN_SECRET')
        return 'test-refresh-secret-1234567890';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;

  const cookieServiceStub = {
    extractRefreshCookie: jest.fn(),
  } as unknown as CookieService;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtRefreshStrategy(configServiceStub, cookieServiceStub);
  });

  const validPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    deviceId: 'device-uuid-1',
    sid: '22222222-2222-4222-8222-222222222222',
    jti: '33333333-3333-4333-8333-333333333333',
    tokenUse: 'refresh',
  };

  it('validates and returns sanitized payload for a valid refresh token', () => {
    const result = strategy.validate(validPayload);
    expect(result).toEqual({
      sub: validPayload.sub,
      deviceId: validPayload.deviceId,
      sid: validPayload.sid,
      jti: validPayload.jti,
      tokenUse: 'refresh',
    });
  });

  describe('Test 7: Signed JWT with missing or malformed jti', () => {
    it('throws UnauthorizedException when jti is missing', () => {
      const payloadWithoutJti = { ...validPayload };
      delete (payloadWithoutJti as Record<string, unknown>).jti;

      expect(() => strategy.validate(payloadWithoutJti)).toThrow(
        UnauthorizedException,
      );
      expect(() => strategy.validate(payloadWithoutJti)).toThrow(
        'Malformed token cryptographic identifiers',
      );
    });

    it('throws UnauthorizedException when jti is empty string', () => {
      const payloadEmptyJti = { ...validPayload, jti: '' };

      expect(() => strategy.validate(payloadEmptyJti)).toThrow(
        UnauthorizedException,
      );
      expect(() => strategy.validate(payloadEmptyJti)).toThrow(
        'Malformed token cryptographic identifiers',
      );
    });

    it('throws UnauthorizedException when jti is not a valid UUID v4', () => {
      const payloadInvalidJti = { ...validPayload, jti: 'not-a-valid-uuid-v4' };

      expect(() => strategy.validate(payloadInvalidJti)).toThrow(
        UnauthorizedException,
      );
      expect(() => strategy.validate(payloadInvalidJti)).toThrow(
        'Malformed token cryptographic identifiers',
      );
    });
  });

  describe('Additional payload integrity checks', () => {
    it('throws UnauthorizedException when payload is null or not an object', () => {
      expect(() => strategy.validate(null)).toThrow('Invalid refresh token');
      expect(() => strategy.validate('string-payload')).toThrow(
        'Invalid refresh token',
      );
    });

    it('throws UnauthorizedException when tokenUse is not refresh', () => {
      expect(() =>
        strategy.validate({ ...validPayload, tokenUse: 'access' }),
      ).toThrow('Invalid token purpose');
    });

    it('throws UnauthorizedException when deviceId is missing or empty', () => {
      expect(() =>
        strategy.validate({ ...validPayload, deviceId: '' }),
      ).toThrow('Invalid device identifier in token');
    });

    it('throws UnauthorizedException when sub or sid are not valid UUID v4', () => {
      expect(() =>
        strategy.validate({ ...validPayload, sub: 'invalid-sub' }),
      ).toThrow('Malformed token cryptographic identifiers');

      expect(() =>
        strategy.validate({ ...validPayload, sid: 'invalid-sid' }),
      ).toThrow('Malformed token cryptographic identifiers');
    });
  });
});
