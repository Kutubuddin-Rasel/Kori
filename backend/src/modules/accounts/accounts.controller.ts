import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/domain/enums';
import { AccountRestrictionService } from './account-restriction.service';
import { AccountRestrictionParam } from './dto/account-restriction.param.dto';
import { UserId } from 'src/domain/value-objects/user-id.vo';

@Controller('admin/accounts')
@UseGuards(AccessTokenGuard, ActiveAccountGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AccountsController {
  constructor(private readonly restrictions: AccountRestrictionService) {}

  @Patch(':userId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(@Param() params: AccountRestrictionParam) {
    return this.restrictions.suspend(UserId.from(params.userId));
  }

  @Patch(':userId/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(@Param() params: AccountRestrictionParam) {
    return this.restrictions.reactivate(UserId.from(params.userId));
  }
}
