import Redis from 'ioredis';
import { childLogger } from '@/lib/observability/logger';

const log = childLogger({ module: 'redis' });

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (redisInstance) return redisInstance;

  const url = process.env.REDIS_URL || 'redis://:hotel_redis_2026@localhost:6379';

  redisInstance = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redisInstance.on('error', (err) => {
    log.error({ error: err.message }, 'Redis connection error');
  });

  redisInstance.on('connect', () => {
    log.info('Redis connected');
  });

  return redisInstance;
}

export async function connectRedis(): Promise<Redis> {
  const redis = getRedis();
  if (redis.status === 'wait') {
    await redis.connect();
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}