import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheOptions } from '../interfaces/redis.interface';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private isConnected = false;
  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST'),
        port: this.configService.get<number>('REDIS_PORT'),
        password: this.configService.get<string>('REDIS_PASSWORD'),
      });

      this.redis.on('error', (error) => {
        console.error('Redis connection error: ', error.message);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        console.log('Redis ready for operations');
        this.isConnected = true;
      });

      this.redis.on('reconnecting', () => {
        console.log('Redis reconnecting ....');
      });

      this.redis.on('end', () => {
        console.log('Redis connection ended');
        this.isConnected = false;
      });
    } catch (error: unknown) {
      console.error('Redis error: ', error);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      console.log('Redis disconnected');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      console.warn('Redis is not connected');
      return null;
    }

    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as T;
    } catch {
      console.log('Error getting cache');
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions): Promise<boolean> {
    if (!this.isConnected) {
      console.warn('Redis is not connected');
      return false;
    }

    const data = JSON.stringify(value);
    let result: 'OK' | null;

    try {
      if (options.ttl) {
        result = await this.redis.setex(key, options.ttl, data);
      } else {
        result = await this.redis.set(key, data);
      }
      return result === 'OK';
    } catch {
      console.warn('Error setting cache');
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      console.warn('Redis is not connected');
      return false;
    }

    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch {
      console.warn('Error deleting cache');
      return false;
    }
  }
}
