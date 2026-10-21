import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AppModule } from 'src/app.module';
import { WalletType as PrismaWalletType } from 'generated/prisma/enums';

describe('[Integration Real PostgreSQL] SYSTEM Wallet Database Invariants', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Guarantee baseline SYSTEM wallet exists
    const existing = await prisma.wallet.findFirst({
      where: { type: PrismaWalletType.SYSTEM },
    });

    if (!existing) {
      await prisma.wallet.create({
        data: {
          type: PrismaWalletType.SYSTEM,
          userId: null,
          currency: 'BDT',
          isActive: true,
          balance: 0n,
        },
      });
    }
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // Test B — Actual PostgreSQL uniqueness
  it('rejects a second SYSTEM wallet with unique constraint violation P2002', async () => {
    const existing = await prisma.wallet.findMany({
      where: {
        type: PrismaWalletType.SYSTEM,
      },
    });

    expect(existing).toHaveLength(1);

    await expect(
      prisma.wallet.create({
        data: {
          type: PrismaWalletType.SYSTEM,
          userId: null,
          currency: 'BDT',
          isActive: true,
          balance: 0n,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });

    const afterward = await prisma.wallet.findMany({
      where: {
        type: PrismaWalletType.SYSTEM,
      },
    });

    expect(afterward).toHaveLength(1);
    expect(afterward[0].id).toBe(existing[0].id);
  });

  // Test C — Invalid SYSTEM currency
  it('rejects changing SYSTEM currency away from BDT due to check constraint', async () => {
    const system = await prisma.wallet.findFirstOrThrow({
      where: {
        type: PrismaWalletType.SYSTEM,
      },
    });

    await expect(
      prisma.$executeRaw`UPDATE wallets SET currency = 'USD' WHERE id = ${system.id}::uuid`,
    ).rejects.toThrow();

    const unchanged = await prisma.wallet.findUniqueOrThrow({
      where: { id: system.id },
    });

    expect(unchanged.currency).toBe('BDT');
  });

  // Test D — SYSTEM cannot become inactive
  it('rejects direct deactivation of SYSTEM due to check constraint', async () => {
    const system = await prisma.wallet.findFirstOrThrow({
      where: {
        type: PrismaWalletType.SYSTEM,
      },
    });

    await expect(
      prisma.wallet.update({
        where: { id: system.id },
        data: { isActive: false },
      }),
    ).rejects.toThrow();

    const unchanged = await prisma.wallet.findUniqueOrThrow({
      where: { id: system.id },
    });

    expect(unchanged.isActive).toBe(true);
  });
});
