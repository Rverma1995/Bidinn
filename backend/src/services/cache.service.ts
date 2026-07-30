import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Ensure env variables are loaded if this file is imported early
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      retryStrategy(times) {
        // Reconnect after a delay, max 2 seconds
        return Math.min(times * 50, 2000);
      }
    });

    this.redis.on('error', (err) => {
      console.error('Redis error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis for caching');
    });
  }

  public async connect() {
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (data) {
        return JSON.parse(data) as T;
      }
      return null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  public async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  public async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache del error for key ${key}:`, error);
    }
  }

  public async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      console.error(`Cache delByPattern error for pattern ${pattern}:`, error);
    }
  }
}

export const cacheService = new CacheService();
