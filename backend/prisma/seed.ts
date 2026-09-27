import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, WalletType } from 'generated/prisma/client';
import { Pool } from 'pg';

const databaseURL = process.env.DATABASE_URL;

if (!databaseURL) {
  throw new Error('DATABASE_URL is required to bootstrap Kori database state.');
}

const pool = new Pool({ connectionString: databaseURL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function bootstrapRequiredState(): Promise<void> {
  const systemWallets = await prisma.wallet.findMany({
    where: { type: WalletType.SYSTEM },
    select: {
      id: true,
      currency: true,
      userId: true,
      isActive: true,
    },
    take: 2,
  });

  if (systemWallets.length > 1) {
    throw new Error(
      'Bootstrap failed: multiple SYSTEM wallets exist. Financial system state is ambiguous.',
    );
  }

  const existingSystemWallet = systemWallets[0];

  if (existingSystemWallet) {
    if (existingSystemWallet.currency !== 'BDT') {
      throw new Error('Bootstrap failed: SYSTEM wallet must use BDT.');
    }

    if (existingSystemWallet.userId !== null) {
      throw new Error(
        'Bootstrap failed: SYSTEM wallet must not belong to a user.',
      );
    }

    if (!existingSystemWallet.isActive) {
      throw new Error('Bootstrap failed: SYSTEM wallet is inactive.');
    }

    console.log(`SYSTEM wallet already exists: ${existingSystemWallet.id}`);

    return;
  }

  const systemWallet = await prisma.wallet.create({
    data: {
      type: WalletType.SYSTEM,
      currency: 'BDT',
    },
    select: {
      id: true,
    },
  });

  console.log(`SYSTEM wallet created: ${systemWallet.id}`);
}

bootstrapRequiredState()
  .catch((error: unknown) => {
    console.error('Failed to bootstrap Kori required state.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
