// This file defines the interface for Redis cache operations in the application.
export interface RedisCacheOptions {
  ttl?: number;
  nx?: boolean;
}
