import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Headers,
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

/**
 * TransactionsController handles all transaction-related endpoints, including sending money,
 * cashing in, cashing out, making payments, and adding money to the wallet. It uses the
 * TransactionsService to perform the actual business logic and is protected by the
 * AccessTokenGuard to ensure that only authenticated users can access these endpoints.
 * The IdempotencyInterceptor is applied to ensure that duplicate requests with the same
 * idempotency key are handled gracefully.
 */
@Controller('transactions')
@UseInterceptors(IdempotencyInterceptor)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // Endpoint to send money from one user to another
  @Post('send')
  @UseGuards(AccessTokenGuard)
  async sendMoney(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: SendMoneyDto,
  ): Promise<TransactionResultResponse> {
    return this.transactionsService.sendMoney(userId, dto, idempotencyKey);
  }

  // Endpoint for agents to cash in money to a user's wallet
  @Post('cash-in')
  @UseGuards(AccessTokenGuard)
  async cashIn(
    @CurrentUser('sub') agentId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: CashInDto,
  ): Promise<TransactionResultResponse> {
    return this.transactionsService.cashIn(agentId, dto, idempotencyKey);
  }

  // Endpoint for users to cash out money from their wallet
  @Post('cash-out')
  @UseGuards(AccessTokenGuard)
  async cashOut(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: CashOutDto,
  ): Promise<TransactionResultResponse> {
    return this.transactionsService.cashOut(userId, dto, idempotencyKey);
  }

  // Endpoint for users to make payments to merchants or service providers
  @Post('payment')
  @UseGuards(AccessTokenGuard)
  async payment(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: PaymentDto,
  ): Promise<TransactionResultResponse> {
    return this.transactionsService.payment(userId, dto, idempotencyKey);
  }

  // Endpoint for users to add money to their wallet using linked bank accounts or cards
  @Post('add-money')
  @UseGuards(AccessTokenGuard)
  async addMoney(
    @CurrentUser('sub') userId: string,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: AddMoneyDto,
  ): Promise<TransactionResultResponse> {
    return this.transactionsService.addMoney(userId, dto, idempotencyKey);
  }
}
