import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { WalletsModule } from '../wallets/wallets.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';

@Module({
  imports: [WalletsModule, RedisModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
