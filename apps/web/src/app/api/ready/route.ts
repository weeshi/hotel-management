import { NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { runWithTenant } from '@/lib/tenant/runtime-context';
import { getRedis } from '@/lib/redis';
import { getQueueHealth } from '@/workers/queue';
import { runRlsCensus } from '../../../../scripts/verify-rls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/hotel_management';

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  const started = Date.now();

  try {
    await runWithTenant({ mode: 'PLATFORM' }, async () => {
      await prisma.$queryRawUnsafe('SELECT 1');
    });
    checks.db = { ok: true };
  } catch (e: any) {
    checks.db = { ok: false, detail: (e as Error).message };
  }

  try {
    const redis = getRedis();
    const pong = await redis.ping();
    checks.redis = { ok: pong === 'PONG' };
  } catch (e: any) {
    checks.redis = { ok: false, detail: (e as Error).message };
  }

  try {
    const queues = await getQueueHealth();
    const failed = Object.entries(queues)
      .filter(([, v]) => v.active > 0 || v.failed > 0)
      .map(([k, v]) => ({ queue: k, ...v }));
    checks.queues = { ok: true, detail: failed.length ? undefined : 'idle' };
    if (failed.length) checks.queues.detail = JSON.stringify(failed);
  } catch (e: any) {
    checks.queues = { ok: false, detail: (e as Error).message };
  }

  try {
    const census = await runRlsCensus(ADMIN_URL);
    checks.rls = {
      ok: census.ok,
      detail: census.ok
        ? JSON.stringify(census.summary)
        : census.failures.join('; ').slice(0, 500),
    };
  } catch (e: any) {
    checks.rls = { ok: false, detail: (e as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const latencyMs = Date.now() - started;

  return NextResponse.json(
    {
      status: allOk ? 'ready' : 'degraded',
      checks,
      latencyMs,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}