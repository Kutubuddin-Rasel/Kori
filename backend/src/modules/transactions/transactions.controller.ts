import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionResultResponse } from './interfaces/transaction-response.interface';
import { IdempotencyInterceptor } from 'src/common/interceptors/idempotency.interceptor';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { SendMoneyDto } from './dto/send-money.dto';
import { CashInDto } from './dto/cash-in.dto';
import { CashOutDto } from './dto/cash-out.dto';
import { PaymentDto } from './dto/payment.dto';
import { AddMoneyDto } from './dto/add-money.dto';

@Controller('transactions')
@UseInterceptors(IdempotencyInterceptor)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('send')
  @UseGuards(AccessTokenGuard)
  async sendMoney(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: SendMoneyDto,
  ): Promise<TransactionResultResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'x-idempotency-key header is absolutely required',
      );
    }
    return this.transactionsService.sendMoney(userId, dto, idempotencyKey);
  }

  @Post('cash-in')
  @UseGuards(AccessTokenGuard)
  async cashIn(
    @CurrentUser('sub') agentId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: CashInDto,
  ): Promise<TransactionResultResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'x-idempotency-key header is absolutely required',
      );
    }
    return this.transactionsService.cashIn(agentId, dto, idempotencyKey);
  }

  @Post('cash-out')
  @UseGuards(AccessTokenGuard)
  async cashOut(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: CashOutDto,
  ): Promise<TransactionResultResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'x-idempotency-key header is absolutely required',
      );
    }
    return this.transactionsService.cashOut(userId, dto, idempotencyKey);
  }

  @Post('payment')
  @UseGuards(AccessTokenGuard)
  async payment(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: PaymentDto,
  ): Promise<TransactionResultResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'x-idempotency-key header is absolutely required',
      );
    }
    return this.transactionsService.payment(userId, dto, idempotencyKey);
  }

  @Post('add-money')
  @UseGuards(AccessTokenGuard)
  async addMoney(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: AddMoneyDto,
  ): Promise<TransactionResultResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'x-idempotency-key header is absolutely required',
      );
    }
    return this.transactionsService.addMoney(userId, dto, idempotencyKey);
  }
}
