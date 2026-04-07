import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, of, tap, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { Request } from 'express';

type IdempotencyCacheState = 'PROCESSING' | Record<string, unknown>;

export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly idempotency_TTL: number;
  private readonly processing_TTL: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.idempotency_TTL = configService.getOrThrow<number>(
      'IDEMPOTENCY_TTL_SECONDS',
    );
    this.processing_TTL = configService.getOrThrow<number>(
      'PROCESSING_TTL_SECONDS',
    );
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract Header
    const idempotencyKey = request.headers['x-idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new BadRequestException(
        'CRITICAL: The x-idempotency-key header is required for this operation to prevent double-charging.',
      );
    }
    const redisKey = `idempotency:trx:${idempotencyKey}`;

    // Fetech the current state from the redis
    const cacheState =
      await this.redisService.get<IdempotencyCacheState>(redisKey);

    // STATE A : It's currently executing in another thread
    if (cacheState === 'PROCESSING') {
      this.logger.warn(
        `Idempotency collison detected for this key: ${idempotencyKey}`,
      );
      throw new ConflictException(
        'This request is currently being processed. Please wait.',
      );
    }

    // STATE B : It already succeded in the past
    // Return the cache response immediatedly
    if (cacheState) {
      this.logger.log(
        `Idempotency cache hit. Returning cache for : ${idempotencyKey}`,
      );
      return of(cacheState);
    }

    // STATE C : It's a new request
    // Lock it and set a 30s TTL in case server crashes
    const locked = await this.redisService.set(redisKey, 'PROCESSING', {
      ttl: this.processing_TTL,
      nx: true,
    });

    if (!locked) {
      this.logger.warn(
        `Idempotency collison detected for this key: ${idempotencyKey}`,
      );
      throw new ConflictException(
        'This request is currently being processed. Please wait.',
      );
    }

    // Let the Controller and Service run the business logic
    return next.handle().pipe(
      tap((responsePayload: unknown) => {
        // The transaction was successful. Save the exact HTTP JSON payload
        // Back to Redis for 24 hours
        this.redisService
          .set(redisKey, responsePayload, {
            ttl: this.idempotency_TTL,
          })
          .catch((error) => {
            this.logger.error(
              `Failed to cache response for key: ${idempotencyKey}`,
              error,
            );
          });
      }),

      // 'catchError' catches any HttpExceptions (Insufficient Funds, Bad KYC, etc.)
      catchError((error: unknown) => {
        // The business logic failed, so the transaction never occured
        // Delete the lock instantly, so user can fix the issue and retry
        this.redisService.del(redisKey).catch((dellErr) => {
          this.logger.error(`Failed to delete key: ${redisKey}`, dellErr);
        });
        // Pass the error so that NestJs can return the 400 status to the user
        return throwError(() => error);
      }),
    );
  }
}
