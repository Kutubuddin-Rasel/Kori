import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheOptions } from '../interfaces/redis.interface';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private isConnected = false;
  private readonly looger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
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

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.looger.log('Redis disconnected');
    }
  }

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

  async set<T>(key: string, value: T, options: CacheOptions): Promise<boolean> {
    if (!this.isConnected) {
      this.looger.warn('Redis is not connected');
      return false;
    }

    const data = JSON.stringify(value);
    let result: 'OK' | null;

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

  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      this.looger.warn('Redis is not connected');
      return false;
    }

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
