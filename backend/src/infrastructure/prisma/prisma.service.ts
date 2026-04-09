import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { Pool } from 'pg';

/**
 * PrismaService is a NestJS service that extends the PrismaClient to manage database connections.
 * It uses the PrismaPg adapter to connect to a PostgreSQL database and implements lifecycle hooks
 * to ensure proper connection management.
 */

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // The connection pool for managing database connections
  private pool: Pool;

  // The constructor initializes the PrismaClient with the PostgreSQL adapter and sets up the connection pool
  constructor(private readonly configService: ConfigService) {
    const pool = new Pool({
      connectionString: configService.get<string>('DATABASE_URL'),
    });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: ['warn', 'error'] });
    this.pool = pool;
  }

  // onModuleInit is called when the module is initialized, and it connects to the database
  async onModuleInit() {
    await this.$connect();
  }

  // onModuleDestroy is called when the module is destroyed, and it disconnects from the database and ends the connection pool
  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
