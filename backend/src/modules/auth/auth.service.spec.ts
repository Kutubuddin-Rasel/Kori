import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { WalletsService } from '../wallets/wallets.service';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './services/password.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { TooManyRequestsException } from './exceptions/too-many-requests.exception';
import { AuthProofService } from './services/auth-proof.service';
import { DeviceVerificationRequiredException } from './exceptions/device-verification-required.exception';

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
    getStrict: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    incrementWithTtl: jest.Mock;
    evalScript: jest.Mock;
  };

  let prismaServiceStub: {
    user: {
      findUnique: jest.Mock;
    };
    trustDevice: {
      update: jest.Mock;
      find: jest.Mock;
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

  let authProofService: {
    consumeRegistrationAuthorization: jest.Mock;
    issueDeviceEnrollmentAuthorization: jest.Mock;
  };

  beforeEach(async () => {
    walletsServiceStub = {
      createPersonalWallet: jest.fn(),
    };

    configServiceStub = {
      getOrThrow: jest.fn((key: string) => {
        const config: Record<string, number> = {
          LOGIN_MAX_FAILURES: 5,
          LOGIN_FAILURE_WINDOW_SECONDS: 900,
          LOGIN_THROTTLE_SECONDS: 60,
        };
        return config[key];
      }),
    };

    redisServiceStub = {
      get: jest.fn().mockResolvedValue(null),
      getStrict: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
      incrementWithTtl: jest.fn().mockResolvedValue(1),
      evalScript: jest.fn().mockResolvedValue(null),
    };

    prismaServiceStub = {
      user: {
        findUnique: jest.fn(),
      },
      trustDevice: {
        update: jest.fn(),
        find: jest.fn(),
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

    authProofService = {
      consumeRegistrationAuthorization: jest.fn().mockResolvedValue('INVALID'),
      issueDeviceEnrollmentAuthorization: jest.fn(),
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
        {
          provide: AuthProofService,
          useValue: authProofService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('reject registration when registration token is missing', async () => {
    const credentials = {
      phone: '+8801712345678',
      pin: '1234',
      deviceId: 'device-1',
      registrationToken: '',
    };

    authProofService.consumeRegistrationAuthorization.mockResolvedValueOnce(
      'MISSING',
    );
    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
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
      registrationToken: '',
    };

    authProofService.consumeRegistrationAuthorization.mockResolvedValueOnce(
      'CONSUMED',
    );

    prismaServiceStub.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      phone: credentials.phone,
    });

    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prismaServiceStub.user.findUnique).toHaveBeenCalledWith({
      where: { phone: credentials.phone },
    });

    expect(prismaServiceStub.$transaction).not.toHaveBeenCalled();
    expect(passwordServiceStub.hash).not.toHaveBeenCalled();
    expect(jwtServiceStub.signAsync).not.toHaveBeenCalled();
    expect(walletsServiceStub.createPersonalWallet).not.toHaveBeenCalled();
  });

  it('register a new user when registration token is valid', async () => {
    const credentials = {
      phone: '+8801712345678',
      pin: '1234',
      deviceId: 'device-1',
      registrationToken: '',
    };

    authProofService.consumeRegistrationAuthorization.mockResolvedValueOnce(
      'CONSUMED',
    );
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
  });

  it('throttles login before querying the user when a throttle exists', async () => {
    redisServiceStub.getStrict.mockResolvedValueOnce(true);

    await expect(
      service.login({
        phone: '+8801712345678',
        pin: '1234',
        deviceId: 'device-1',
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);

    expect(prismaServiceStub.user.findUnique).not.toHaveBeenCalled();
  });

  it('records a failed login when PIN verification fails', async () => {
    redisServiceStub.getStrict.mockResolvedValueOnce(null);

    prismaServiceStub.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      phone: '+8801712345678',
      pin: 'hash-pin',
      status: 'ACTIVE',
      role: 'CUSTOMER',
      trustDevices: [],
    });

    passwordServiceStub.verify.mockResolvedValueOnce(false);
    redisServiceStub.incrementWithTtl.mockResolvedValueOnce(1);

    await expect(
      service.login({
        phone: '+8801712345678',
        pin: '1111',
        deviceId: 'device-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(redisServiceStub.incrementWithTtl).toHaveBeenCalled();
  });

  it('starts login throttling when the failure threshold is reached', async () => {
    redisServiceStub.getStrict.mockResolvedValueOnce(null);
    prismaServiceStub.user.findUnique.mockResolvedValueOnce(null);
    redisServiceStub.incrementWithTtl.mockResolvedValueOnce(5);

    await expect(
      service.login({
        phone: '+8801712345678',
        pin: '1111',
        deviceId: 'device-1',
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);

    expect(redisServiceStub.set).toHaveBeenCalledWith(
      'auth:login:throttle:+8801712345678',
      true,
      {
        ttl: 60,
      },
    );
  });

  it('issue device enrollment authorization when device is new', async () => {
    redisServiceStub.getStrict.mockResolvedValueOnce(null);
    prismaServiceStub.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      phone: '+8801712345678',
      pin: 'hash-pin',
      status: 'ACTIVE',
      role: 'CUSTOMER',
      trustDevices: ['device-2'],
    });
    passwordServiceStub.verify.mockResolvedValueOnce(true);
    prismaServiceStub.trustDevice.find.mockResolvedValueOnce(null);
    authProofService.issueDeviceEnrollmentAuthorization.mockResolvedValueOnce({
      token: 'test-token',
      expiresIn: 300,
    });

    await expect(
      service.login({
        phone: '+8801712345678',
        pin: '1111',
        deviceId: 'device-1',
      }),
    ).rejects.toBeInstanceOf(DeviceVerificationRequiredException);
  });
});
