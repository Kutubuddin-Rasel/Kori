import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisCacheOptions } from '../interfaces/redis.interface';

/**
 * RedisService provides methods to interact with Redis cache.
 * It handles connection management, error handling, and provides methods to get, set, and delete cache entries.
 * The service uses ioredis for Redis interactions and integrates with NestJS lifecycle hooks for proper resource management.
 * It also includes logging for connection status and errors to facilitate debugging and monitoring.
 */

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  // Redis client instance
  private redis!: Redis;
  private isConnected = false;
  private readonly looger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes the Redis client and sets up event listeners for connection status and errors.
   * The method retrieves Redis connection parameters from the configuration service and attempts to connect to Redis.
   * It also handles various Redis events such as 'error', 'connect', 'ready', 'reconnecting', and 'end' to manage connection status and log relevant information.
   */
  onModuleInit() {
    try {
      // Initialize Redis client with configuration parameters
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST'),
        port: this.configService.get<number>('REDIS_PORT'),
        password: this.configService.get<string>('REDIS_PASSWORD'),
      });

      this.redis.on('error', (error) => {
        this.looger.error('Redis connection error: ', error.message);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        this.looger.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        this.looger.log('Redis ready for operations');
        this.isConnected = true;
      });

      this.redis.on('reconnecting', () => {
        this.looger.log('Redis reconnecting ....');
      });

      this.redis.on('end', () => {
        this.looger.log('Redis connection ended');
        this.isConnected = false;
      });
    } catch (error: unknown) {
      this.looger.error('Redis error: ', error);
      this.isConnected = false;
    }
  }

  // Properly close the Redis connection when the module is destroyed to free up resources and prevent memory leaks.
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.looger.log('Redis disconnected');
    }
  }

  /**
   * Retrieves a value from Redis cache by key. It checks if the Redis connection is active before attempting to get the value.
   * If the connection is not active, it logs a warning and returns null. If the key does not exist in Redis, it also returns null.
   * The method attempts to parse the retrieved value as JSON and returns it as the specified type T. If parsing fails, it logs an error and returns null.
   * @param key The key to retrieve from Redis cache.
   * @returns A promise that resolves to the value associated with the key, or null if the key does not exist or if there is an error.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      this.looger.warn('Redis is not connected');
      return null;
    }

    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as T;
    } catch (error) {
      this.looger.error(
        `Error getting Redis key:${key}`,
        error instanceof Error ? error.stack : error,
      );
      return null;
    }
  }

  /**
   * Sets a value in Redis cache with the specified key and options. It checks if the Redis connection is active before attempting to set the value.
   * If the connection is not active, it logs a warning and returns false. The method accepts options for time-to-live (ttl) and NX (only set if key does not exist).
   * It attempts to set the value in Redis using the appropriate command based on the provided options. If the operation is successful, it returns true; otherwise, it returns false.
   * If there is an error during the operation, it logs the error and returns false.
   * @param key The key to set in Redis cache.
   * @param value The value to associate with the key in Redis cache.
   * @param options Options for setting the value, including ttl (time-to-live) and nx (only set if key does not exist).
   * @returns A promise that resolves to true if the value was set successfully, or false if there was an error or if Redis is not connected.
   */
  async set<T>(
    key: string,
    value: T,
    options: RedisCacheOptions,
  ): Promise<boolean> {
    if (!this.isConnected) {
      this.looger.warn('Redis is not connected');
      return false;
    }

    // Serialize the value to a JSON string before storing it in Redis.
    const data = JSON.stringify(value);
    let result: 'OK' | null;

    // Determine the appropriate Redis command based on the provided options and attempt to set the value in Redis.
    try {
      if (options.ttl && options.nx) {
        result = await this.redis.set(key, data, 'EX', options.ttl, 'NX');
      } else if (options.ttl) {
        result = await this.redis.set(key, data, 'EX', options.ttl);
      } else if (options.nx) {
        result = await this.redis.set(key, data, 'NX');
      } else {
        result = await this.redis.set(key, data);
      }

      return result === 'OK';
    } catch (error) {
      this.looger.error(
        `Error setting Redis key:${key}`,
        error instanceof Error ? error.stack : error,
      );
      return false;
    }
  }

  /**
   * Deletes a key from Redis cache. It checks if the Redis connection is active before attempting to delete the key.
   * If the connection is not active, it logs a warning and returns false. The method attempts to delete the key from Redis and returns true if the key was deleted successfully (i.e., if the result is greater than 0).
   * If there is an error during the operation, it logs the error and returns false.
   * @param key The key to delete from Redis cache.
   * @returns A promise that resolves to true if the key was deleted successfully, or false if there was an error or if Redis is not connected.
   */
  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      this.looger.warn('Redis is not connected');
      return false;
    }

    // Attempt to delete the key from Redis and return true if the key was deleted successfully (i.e., if the result is greater than 0).
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      this.looger.error(
        `Error deleting Redis key:${key}`,
        error instanceof Error ? error.stack : error,
      );
      return false;
    }
  }
}
