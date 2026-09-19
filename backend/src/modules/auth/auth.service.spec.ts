import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { WalletsService } from '../wallets/wallets.service';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './services/password.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  let walletsServiceStub: {
    createPersonalWallet: jest.Mock;
  };

  let configServiceStub: {
    getOrThrow: jest.Mock;
  };

  let redisServiceStub: {
    get: jest.Mock;
    del: jest.Mock;
  };

  let prismaServiceStub: {
    user: {
      findUnique: jest.Mock;
    };
    trustDevice: {
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  let passwordServiceStub: {
    hash: jest.Mock;
    verify: jest.Mock;
  };

  let jwtServiceStub: {
    signAsync: jest.Mock;
  };

  beforeEach(async () => {
    walletsServiceStub = {
      createPersonalWallet: jest.fn(),
    };

    configServiceStub = {
      getOrThrow: jest.fn(),
    };

    redisServiceStub = {
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn(),
    };

    prismaServiceStub = {
      user: {
        findUnique: jest.fn(),
      },
      trustDevice: {
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    passwordServiceStub = {
      hash: jest.fn(),
      verify: jest.fn(),
    };

    jwtServiceStub = {
      signAsync: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: WalletsService,
          useValue: walletsServiceStub,
        },
        {
          provide: ConfigService,
          useValue: configServiceStub,
        },
        {
          provide: RedisService,
          useValue: redisServiceStub,
        },
        {
          provide: PasswordService,
          useValue: passwordServiceStub,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceStub,
        },
        {
          provide: JwtService,
          useValue: jwtServiceStub,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reject registration when OTP clearance is missing', async () => {
    const credentials = {
      phone: '+8801712345678',
      pin: '1234',
      deviceId: 'device-1',
    };

    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(redisServiceStub.get).toHaveBeenCalledWith(
      `register_clearance:${credentials.phone}`,
    );

    expect(prismaServiceStub.user.findUnique).not.toHaveBeenCalled();
    expect(prismaServiceStub.$transaction).not.toHaveBeenCalled();
    expect(passwordServiceStub.hash).not.toHaveBeenCalled();
    expect(jwtServiceStub.signAsync).not.toHaveBeenCalled();
    expect(walletsServiceStub.createPersonalWallet).not.toHaveBeenCalled();
  });

  it('reject registration when user is already registered', async () => {
    const credentials = {
      phone: '+8801712345678',
      pin: '1234',
      deviceId: 'device-1',
    };

    redisServiceStub.get.mockResolvedValueOnce('GRANTED');

    prismaServiceStub.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      phone: credentials.phone,
    });

    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const key = `register_clearance:${credentials.phone}`;
    expect(redisServiceStub.get).toHaveBeenCalledWith(key);

    expect(prismaServiceStub.user.findUnique).toHaveBeenCalledWith({
      where: { phone: credentials.phone },
    });

    expect(prismaServiceStub.$transaction).not.toHaveBeenCalled();
    expect(passwordServiceStub.hash).not.toHaveBeenCalled();
    expect(jwtServiceStub.signAsync).not.toHaveBeenCalled();
    expect(walletsServiceStub.createPersonalWallet).not.toHaveBeenCalled();
  });

  it('register a new user when OTP clearance is valid', async () => {
    const credentials = {
      phone: '+8801712345678',
      pin: '1234',
      deviceId: 'device-1',
    };

    redisServiceStub.get.mockResolvedValueOnce('GRANTED');
    prismaServiceStub.user.findUnique.mockResolvedValueOnce(null);

    passwordServiceStub.hash
      .mockResolvedValueOnce('hash-pin')
      .mockResolvedValueOnce('hash-refresh-token');

    jwtServiceStub.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    configServiceStub.getOrThrow.mockImplementation((key: string) => {
      const value: Record<string, string> = {
        ACCESS_TOKEN_SECRET: 'access-secret',
        ACCESS_TOKEN_EXPIRY: '15m',
        REFRESH_TOKEN_SECRET: 'refresh-secret',
        REFRESH_TOKEN_EXPIRY: '7d',
      };

      return value[key];
    });

    const txStub = {
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          phone: credentials.phone,
          role: 'CUSTOMER',
        }),
      },
      trustDevice: {
        create: jest.fn().mockResolvedValue({
          id: 'trust-device-1',
        }),
      },
    };

    prismaServiceStub.$transaction.mockImplementation(
      async <T>(callback: (tx: typeof txStub) => Promise<T>): Promise<T> => {
        return await callback(txStub);
      },
    );

    const result = await service.register(credentials);

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(txStub.user.create).toHaveBeenCalledWith({
      data: {
        phone: credentials.phone,
        pin: 'hash-pin',
      },
    });

    expect(walletsServiceStub.createPersonalWallet).toHaveBeenCalledWith(
      txStub,
      'user-1',
    );

    expect(txStub.trustDevice.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        deviceId: credentials.deviceId,
        refreshTokenHash: 'hash-refresh-token',
        isAuthorized: true,
      },
    });

    expect(redisServiceStub.del).toHaveBeenCalledWith(
      `register_clearance:${credentials.phone}`,
    );
  });
});
