import { Test } from '@nestjs/testing';
import { OtpService } from '../services/otp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AuthProofService } from '../services/auth-proof.service';
import { Logger } from '@nestjs/common';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';

interface StoredOtpChallenge {
  code: string;
  phone: string;
  deviceId: string;
}

describe('OTP service', () => {
  let loggerDebugSpy: jest.SpyInstance;

  const mockRedisService = {
    getStrict: jest.fn<Promise<unknown>, [string]>(),
    set: jest.fn<Promise<boolean>, [string, unknown, number?]>(),
    del: jest.fn<Promise<number>, [string]>(),
    incrementWithTtl: jest.fn<Promise<number>, [string, number]>(),
    evalScript: jest.fn<Promise<unknown>, [string, string[], unknown[]]>(),
  };

  const mockPrismaService = {
    user: { findUnique: jest.fn<Promise<unknown>, [unknown]>() },
    trustDevice: { upsert: jest.fn<Promise<unknown>, [unknown]>() },
  };

  async function createOtpService(
    env: 'production' | 'development',
  ): Promise<OtpService> {
    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        const config: Record<string, string | number> = {
          NODE_ENV: env,
          OTP_TIME_LIMIT: 180,
          CLEARANCE_TTL: 300,
          OTP_RESEND_COOLDOWN_SECONDS: 60,
          OTP_MAX_FAILURES: 10,
          OTP_FAILURE_WINDOW_SECONDS: 600,
        };

        return config[key];
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuthProofService,
          useValue: {
            issueRegistrationAuthorization: jest.fn(),
          },
        },
      ],
    }).compile();

    return module.get<OtpService>(OtpService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    loggerDebugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log OTP message when NODE_ENV is development', async () => {
    mockRedisService.getStrict.mockResolvedValueOnce(0);
    mockRedisService.set.mockResolvedValue(true);
    const service = await createOtpService('development');

    mockRedisService.set.mockResolvedValueOnce(true);

    await service.sendOtp({
      phone: '+8801712345678',
      deviceId: 'device-1',
    });

    expect(loggerDebugSpy).toHaveBeenCalledTimes(1);
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[DEVELOPMENT ONLY\] OTP for phone ending 5678 is: \d{6}/,
      ),
    );
  });

  it('should not log OTP message when NODE_ENV is production', async () => {
    mockRedisService.getStrict.mockResolvedValueOnce(0);
    mockRedisService.set.mockResolvedValue(true);
    const service = await createOtpService('production');

    mockRedisService.set.mockResolvedValueOnce(true);

    await service.sendOtp({
      phone: '+8801712345678',
      deviceId: 'device-1',
    });

    expect(loggerDebugSpy).not.toHaveBeenCalled();
  });

  it('should return challengeId and store six-digit OTP when sendOtp is called', async () => {
    mockRedisService.getStrict.mockResolvedValueOnce(0);
    mockRedisService.set.mockResolvedValue(true);

    const service = await createOtpService('production');

    const result = await service.sendOtp({
      phone: '+8801712345678',
      deviceId: 'device-1',
    });

    expect(typeof result.challengeId).toBe('string');
    expect(result.challengeId.length).toBeGreaterThan(0);

    const rawCalls = mockRedisService.set.mock.calls as unknown as unknown[][];
    const challenge = rawCalls[1][1] as StoredOtpChallenge;

    expect(challenge.code).toMatch(/^\d{6}$/);
  });

  it('should reject with TooManyRequestsException when an immediate resend is attempted', async () => {
    mockRedisService.getStrict
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(true);

    mockRedisService.set.mockResolvedValueOnce(false);

    const service = await createOtpService('production');

    await expect(
      service.sendOtp({
        phone: '+8801712345678',
        deviceId: 'device-1',
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });
});
