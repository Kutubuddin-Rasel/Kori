import { Test } from '@nestjs/testing';
import { OtpService } from '../services/otp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { Logger } from '@nestjs/common';

describe('OTP service', () => {
  let loggerDebugSpy: jest.SpyInstance;

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(false),
  };
  const mockPrismaService = {};

  async function createOtpService(
    env: 'production' | 'development',
  ): Promise<OtpService> {
    const mockConfigService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return env;
        return 180;
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
    loggerDebugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    loggerDebugSpy.mockClear();
  });

  it('should log OTP message when NODE_ENV is development', async () => {
    const service = await createOtpService('development');

    mockRedisService.set.mockResolvedValueOnce(true);

    await service.sendOtp({
      phone: '+8801712345678',
      deviceId: 'device-1',
    });

    expect(loggerDebugSpy).toHaveBeenCalledTimes(1);
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[DEVELOPMENT ONLY\] OTP for phone ending 5678 is: \d{4}/,
      ),
    );
  });

  it('should not log OTP message when NODE_ENV is productioin', async () => {
    const service = await createOtpService('production');

    mockRedisService.set.mockResolvedValueOnce(true);

    await service.sendOtp({
      phone: '+8801712345678',
      deviceId: 'device-1',
    });

    expect(loggerDebugSpy).not.toHaveBeenCalled();
  });
});
