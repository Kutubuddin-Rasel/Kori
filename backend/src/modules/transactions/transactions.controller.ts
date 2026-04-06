import { Controller, Post, Body, UseGuards, Req, UseInterceptors, Headers, BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionResultResponse } from './interfaces/transaction-interface';
import { IdempotencyInterceptor } from 'src/common/interceptors/idempotency.interceptor';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { SendMoneyDto } from './dto/sendMoney.dto';

@Controller('transactions')
@UseInterceptors(IdempotencyInterceptor)
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }

    @Post('send')
    @UseGuards(AccessTokenGuard)
    async sendMoney(
        @CurrentUser('sub') userId: string,
        @Headers('x-idempotency-key') idempotencyKey: string,
        @Body() dto: SendMoneyDto,
    ): Promise<TransactionResultResponse> {
        if (!idempotencyKey) {
            throw new BadRequestException('x-idempotency-key header is absolutely required');
        }
        return this.transactionsService.sendMoney(userId, dto, idempotencyKey);
    }
}
