import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { WalletsService } from '../wallets/wallets.service';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './services/password.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  const walletsServiceStub = {
    createPersonalWallet: jest.fn(),
  };

  const configServiceStub = {
    getOrThrow: jest.fn(),
  };

  const redisServiceStub = {
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn(),
  };

  const prismaServiceStub = {
    user: {
      findUnique: jest.fn(),
    },
    trustDevice: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordServiceStub = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  const jwtServiceStub = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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

  it('should reject registartion when clearence is missing', async () => {
    const credentials = {
      phone: '+8801712345678',
      pin: '1234',
      deviceId: 'device-1',
    };

    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(redisServiceStub.get).toHaveBeenCalledWith(
      `register_clearence:${credentials.phone}`,
    );

    expect(prismaServiceStub.user.findUnique).not.toHaveBeenCalled();
    expect(prismaServiceStub.$transaction).not.toHaveBeenCalled();
    expect(passwordServiceStub.hash).not.toHaveBeenCalled();
    expect(jwtServiceStub.signAsync).not.toHaveBeenCalled();
    expect(walletsServiceStub.createPersonalWallet).not.toHaveBeenCalled();
  });
});
