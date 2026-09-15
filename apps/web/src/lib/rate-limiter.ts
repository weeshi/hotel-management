import { getRedis } from '@/lib/redis';

const RATE_LIMITER_SCRIPT = `
-- KEYS[1] = rate limit key
-- ARGV[1] = current timestamp (seconds)
-- ARGV[2] = window size (seconds)
-- ARGV[3] = limit
-- ARGV[4] = unique member (timestamp-uuid)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

-- Remove expired entries (older than window)
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count current entries in window
local current = redis.call('ZCARD', key)

if current >= limit then
  -- Limit exceeded, return current count and TTL of oldest entry
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local ttl = 0
  if #oldest > 0 then
    ttl = math.ceil((tonumber(oldest[2]) + window) - now)
  end
  return {0, current, ttl}
end

-- Add new entry
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window + 1)

return {1, current + 1, window}
`;

const scriptShaCache = new Map<string, string>();

async function loadScript(redis: any, script: string): Promise<string> {
  if (!scriptShaCache.has(script)) {
    const sha = await redis.script('LOAD', script);
    scriptShaCache.set(script, sha);
  }
  return scriptShaCache.get(script)!;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp (seconds) when the window resets
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Math.floor(Date.now() / 1000);
  const member = `${now}-${crypto.randomUUID()}`;

  const sha: string = await loadScript(redis, RATE_LIMITER_SCRIPT);

  try {
    const result = await redis.evalsha(
      sha,
      1,
      key,
      String(now),
      String(windowSec),
      String(limit),
      String(member)
    ) as [number, number, number];

    const [allowed, current, ttlOrWindow] = result;
    const resetAt = allowed ? now + windowSec : now + ttlOrWindow;

    return {
      allowed: allowed === 1,
      current,
      limit,
      remaining: allowed === 1 ? limit - current : 0,
      resetAt,
    };
  } catch (err: any) {
    if (err.message?.includes('NOSCRIPT')) {
      scriptShaCache.clear();
      return checkRateLimit(key, limit, windowSec);
    }
    throw err;
  }
}

export async function getRateLimitInfo(
  key: string,
  windowSec: number
): Promise<{ current: number; resetAt: number } | null> {
  const redis = getRedis() as any;
  const now = Math.floor(Date.now() / 1000);

  await redis.zremrangebyscore(key, 0, now - windowSec);
  const current = await redis.zcard(key);
  if (current === 0) return null;

  const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
  if (oldest.length === 0) return null;

  const oldestTimestamp = parseInt(oldest[1] as string, 10);
  const resetAt = oldestTimestamp + windowSec;

  return { current, resetAt };
}