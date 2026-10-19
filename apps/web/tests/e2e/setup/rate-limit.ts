import { getRedis, disconnectRedis } from '../../../src/lib/redis';

const LIMITER_KEY_PREFIXES = [
  'stepup:request:',
  'stepup:verify:',
  'otp:verify:',
  'otp:resend:',
  'ratelimit:payment-session:',
];

export async function resetRateLimitKeys(): Promise<void> {
  const redis = getRedis();
  try {
    for (const prefix of LIMITER_KEY_PREFIXES) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    }
  } finally {
    await disconnectRedis();
  }
}