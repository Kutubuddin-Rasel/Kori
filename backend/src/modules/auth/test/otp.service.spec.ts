import { Test } from '@nestjs/testing';
import { OtpService } from '../services/otp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { VerifyOtpDto } from '../dto/verify-otp.dto';

describe('OTP service', () => {
  let loggerDebugSpy: jest.SpyInstance;

  const mockRedisService = {
    getStrict: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incrementWithTtl: jest.fn(),
    evalScript: jest.fn(), // We must mock evalScript!
  };

  const mockPrismaService = {
    user: { findUnique: jest.fn() },
    trustDevice: { upsert: jest.fn() },
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

  it('returns a challenge id and stores a six-digit OTP', async () => {
    mockRedisService.getStrict.mockResolvedValueOnce(0);
    mockRedisService.set.mockResolvedValue(true);

    const service = await createOtpService('production');

    const result = await service.sendOtp({
      phone: '+8801712345678',
      deviceId: 'device-1',
    });

    expect(result.challengeId).toEqual(expect.any(String));

    const challenge = mockRedisService.set.mock.calls[1][1];

    expect(challenge.code).toMatch(/^\d{6}$/);
  });

  it('rejects an immediate resend', async () => {
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

  it('concurrent attempts pass only one', async () => {
    const dto = Object.assign(new VerifyOtpDto(), {
      phone: '+8801712345678',
      challengeId: '00000000-0000-4000-8000-000000000001',
      otp: '001234',
      deviceId: 'device-1',
    });

    // Mock evalScript to return VERIFIED for the first request,
    // and SUPERSEDED for the second request, simulating Redis's atomic evaluation.
    mockRedisService.evalScript
      .mockResolvedValueOnce(['VERIFIED'])
      .mockResolvedValueOnce(['SUPERSEDED']);

    const service = await createOtpService('production');

    const results = await Promise.allSettled([
      service.verifyOtp(dto),
      service.verifyOtp(dto),
    ]);

    const fulfiled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfiled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
