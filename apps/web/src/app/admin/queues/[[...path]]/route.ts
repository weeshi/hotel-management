import { NextRequest } from 'next/server';
import { handle } from 'hono/vercel';
import { bullApp } from '@/lib/bullBoard';
import { requireSuperAdminCookie } from '@/middlewares/superadmin-cookie';

// bull-board reads UI assets from disk at runtime — cannot run on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bullHandler = handle(bullApp);

async function guarded(request: NextRequest) {
  const denied = await requireSuperAdminCookie(request);
  if (denied) return denied;
  return bullHandler(request);
}

export const GET = guarded;
export const POST = guarded;
export const PUT = guarded;
export const PATCH = guarded;
export const DELETE = guarded;