import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccountRestrictionService } from './account-restriction.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [PassportModule],
  controllers: [AccountsController],
  providers: [AccountRestrictionService],
})
export class AccountsModule {}
