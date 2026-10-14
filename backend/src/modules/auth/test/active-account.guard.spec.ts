import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from 'src/domain/enums';
import { AccountStatus } from 'generated/prisma/enums';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AccessTokenGuard } from '../guards/access-token.guard';
import { ActiveAccountGuard } from '../guards/active-account.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { JwtStrategy } from '../strategies/jwt-strategy';
import { CurrentAccountRequest } from '../interfaces/active-account.interface';

@Controller('test-guard')
@UseGuards(AccessTokenGuard, ActiveAccountGuard)
class TestGuardController {
  @Get('protected')
  getProtected() {
    return { ok: true };
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getAdmin() {
    return { ok: true, role: 'ADMIN' };
  }
}

describe('ActiveAccountGuard & Route Authorization', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let activeAccountGuard: ActiveAccountGuard;

  const testSecret = 'test-access-token-secret-for-guard-suite-12345';
  const testUserId = '11111111-1111-4111-8111-111111111111';

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: testSecret,
          signOptions: { algorithm: 'HS256', expiresIn: '15m' },
        }),
      ],
      controllers: [TestGuardController],
      providers: [
        JwtStrategy,
        ActiveAccountGuard,
        RolesGuard,
        Reflector,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'ACCESS_TOKEN_SECRET') return testSecret;
              throw new Error(`Unexpected key: ${key}`);
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    activeAccountGuard =
      moduleFixture.get<ActiveAccountGuard>(ActiveAccountGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 Forbidden on admin route when JWT claims role ADMIN but database role is CUSTOMER', async () => {
    // Client possesses a valid JWT signed with role ADMIN
    const token = await jwtService.signAsync({
      sub: testUserId,
      role: Role.ADMIN,
    });

    // Authoritative database record indicates the user is actually a CUSTOMER
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: testUserId,
      role: Role.CUSTOMER,
      status: AccountStatus.ACTIVE,
    });

    const response = await request(app.getHttpServer())
      .get('/test-guard/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.message).toContain('Access denied');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: testUserId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });
  });

  it('returns 403 Forbidden on protected route when JWT is cryptographically valid but database account status is SUSPENDED', async () => {
    // Client possesses a cryptographically valid JWT
    const token = await jwtService.signAsync({
      sub: testUserId,
      role: Role.CUSTOMER,
    });

    // Database indicates account is SUSPENDED
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: testUserId,
      role: Role.CUSTOMER,
      status: AccountStatus.SUSPENDED,
    });

    const response = await request(app.getHttpServer())
      .get('/test-guard/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.message).toBe(
      'Your account is currently restricted. Please contact support.',
    );
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: testUserId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });
  });

  it('returns 200 OK on admin route when both JWT and database role are ADMIN with ACTIVE status', async () => {
    const token = await jwtService.signAsync({
      sub: testUserId,
      role: Role.ADMIN,
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: testUserId,
      role: Role.ADMIN,
      status: AccountStatus.ACTIVE,
    });

    const response = await request(app.getHttpServer())
      .get('/test-guard/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ ok: true, role: 'ADMIN' });
  });

  it('returns 200 OK on protected route when JWT is valid and database status is ACTIVE', async () => {
    const token = await jwtService.signAsync({
      sub: testUserId,
      role: Role.CUSTOMER,
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: testUserId,
      role: Role.CUSTOMER,
      status: AccountStatus.ACTIVE,
    });

    const response = await request(app.getHttpServer())
      .get('/test-guard/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  describe('ActiveAccountGuard unit edge cases', () => {
    const createMockExecutionContext = (req: Partial<CurrentAccountRequest>) =>
      ({
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      }) as unknown as ExecutionContext;

    it('throws UnauthorizedException when request.user is missing', async () => {
      const context = createMockExecutionContext({});
      await expect(activeAccountGuard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication required'),
      );
    });

    it('throws UnauthorizedException when user record is not found in database', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      const context = createMockExecutionContext({
        user: { sub: testUserId, role: Role.CUSTOMER },
      });

      await expect(activeAccountGuard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('User account not found.'),
      );
    });

    it('throws InternalServerErrorException when database operation fails', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      prismaMock.user.findUnique.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );
      const context = createMockExecutionContext({
        user: { sub: testUserId, role: Role.CUSTOMER },
      });

      await expect(activeAccountGuard.canActivate(context)).rejects.toThrow(
        new InternalServerErrorException(
          'An error occurred while verifying account status.',
        ),
      );

      loggerSpy.mockRestore();
    });
  });
});
