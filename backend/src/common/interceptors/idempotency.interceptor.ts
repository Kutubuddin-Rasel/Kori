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
// The value stored in Redis can be either 'PROCESSING' or the actual response payload
type IdempotencyCacheState = 'PROCESSING' | Record<string, unknown>;

/**
 * This interceptor ensures that if a user sends the same request multiple times with the same 'x-idempotency-key',
 * only the first request will be processed, and subsequent requests will either wait for the result or receive
 * the cached response. This is crucial for operations like payment processing to prevent double-charging.
 */
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

  /**
   * Intercept the incoming request and implement idempotency logic using Redis.
   * @param context - The execution context of the request.
   * @param next - The next handler in the request processing pipeline.
   * @returns An Observable that emits the response or an error.
   */
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract the idempotency key from the request headers
    const idempotencyKey = request.headers['x-idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new BadRequestException(
        'CRITICAL: The x-idempotency-key header is required for this operation to prevent double-charging.',
      );
    }

    // Construct a unique Redis key for this idempotency key
    const redisKey = `idempotency:trx:${idempotencyKey}`;

    // Fetech the current state from the redis
    const cacheState =
      await this.redisService.get<IdempotencyCacheState>(redisKey);

    /**
     * There are 3 possible states:
     * A. 'PROCESSING' : The first request is still being processed. This can happen when the user sends multiple requests in a very short time frame (e.g. double-clicking the "Pay" button). In this case, we should return a 409 Conflict to tell the user to wait.
     
     * B. Cached Response : The first request has been processed successfully in the past, and the response is cached in Redis. We can return the cached response immediately without calling the Controller or Service.
  
     * C. No Cache : This is a new request that has never been seen before. We should lock it by setting 'PROCESSING' in Redis with a short TTL (e.g. 30 seconds) to prevent other requests from processing it simultaneously. Then we let the Controller and Service handle the business logic. If it succeeds, we cache the response for future identical requests. If it fails, we delete the lock so that the user can fix the issue and retry immediately.
     */

    // STATE A : The first request is still being processed
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

    /**
     * At this point, we have successfully locked the request, which means we are the first one to process it.
     * We let the Controller and Service handle the business logic by calling 'next.handle()'.
     * If it succeeds, we cache the response in Redis for future identical requests.
     * If it fails (e.g. insufficient fund, bad KYC, etc.), we delete the lock immediately so that the user can fix the issue and retry without waiting for the TTL to expire.
     */
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
