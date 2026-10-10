import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../strategies/jwt-strategy';
import { Role } from 'src/domain/enums';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const configServiceStub = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'ACCESS_TOKEN_SECRET') return 'test-access-secret-1234567890';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(configServiceStub);
  });

  const validPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    role: Role.CUSTOMER,
  };

  it('validates and returns sanitized payload for a valid access token', () => {
    const result = strategy.validate(validPayload);
    expect(result).toEqual({
      sub: validPayload.sub,
      role: Role.CUSTOMER,
    });
  });

  it('throws UnauthorizedException when sub is missing, empty, or not UUID v4', () => {
    expect(() => strategy.validate({ role: Role.CUSTOMER })).toThrow(
      'Malformed token cryptographic identifiers',
    );
    expect(() => strategy.validate({ sub: '', role: Role.CUSTOMER })).toThrow(
      'Malformed token cryptographic identifiers',
    );
    expect(() =>
      strategy.validate({ sub: 'not-a-uuid', role: Role.CUSTOMER }),
    ).toThrow('Malformed token cryptographic identifiers');
  });

  it('throws UnauthorizedException when role is missing or not a valid Role enum', () => {
    expect(() => strategy.validate({ sub: validPayload.sub })).toThrow(
      'Invalid or missing user role in token',
    );
    expect(() =>
      strategy.validate({ sub: validPayload.sub, role: 'INVALID_ROLE' }),
    ).toThrow('Invalid or missing user role in token');
  });
});
