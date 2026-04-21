// Cache wrapper around Redis with single-flight + invalidation helpers.

import type IORedis from 'ioredis';
import { getRedis } from '../db/redis.js';
import { logger } from '../lib/logger.js';

const KEY_PREFIX = 'deliveriq';

export class CacheService {
  private r: IORedis;
  constructor() {
    this.r = getRedis();
  }

  key(...parts: string[]): string {
    return [KEY_PREFIX, ...parts].join(':');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.r.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.warn({ err, key }, 'cache.get.failed');
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, 'cache.set.failed');
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.r.del(...keys);
    } catch (err) {
      logger.warn({ err, keys }, 'cache.del.failed');
    }
  }

  /**
   * SCAN + DEL by pattern (do not use KEYS).
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, batch] = await this.r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (batch.length) {
        removed += await this.r.del(...batch);
      }
    } while (cursor !== '0');
    return removed;
  }

  async getOrBuild<T>(key: string, ttlSeconds: number, builder: () => Promise<T>): Promise<{ value: T; cacheStatus: 'HIT' | 'MISS' }> {
    const cached = await this.get<T>(key);
    if (cached !== null) return { value: cached, cacheStatus: 'HIT' };
    const value = await builder();
    await this.set(key, value, ttlSeconds);
    return { value, cacheStatus: 'MISS' };
  }
}

export const cache = new CacheService();
