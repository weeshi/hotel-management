import { getRedis } from '@/lib/redis';
import { childLogger } from '@/lib/observability/logger';

const log = childLogger({ module: 'vgs-client' });

export interface VGSDeleteResult {
  ok: boolean;
  status: number;
  error?: string;
}

const VGS_MANAGEMENT_BASE = 'https://api.verygoodsecurity.com';
const VGS_API_KEY = process.env.VGS_MANAGEMENT_API_KEY;

if (!VGS_API_KEY) {
  log.warn('VGS_MANAGEMENT_API_KEY not set — purge operations will fail');
}

function buildAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${VGS_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function vgsDeleteToken(
  vaultId: string,
  token: string
): Promise<VGSDeleteResult> {
  if (!VGS_API_KEY) {
    return { ok: false, status: 0, error: 'VGS_MANAGEMENT_API_KEY not configured' };
  }

  const url = `${VGS_MANAGEMENT_BASE}/vaults/${vaultId}/data/${token}`;

  try {
    const res = await fetchWithTimeout(url, {
      method: 'DELETE',
      headers: buildAuthHeaders(),
    });

    if (res.ok || res.status === 204) {
      return { ok: true, status: res.status };
    }

    if (res.status === 404) {
      return { ok: true, status: 404 };
    }

    const errorText = await res.text().catch(() => 'Unknown error');
    return { ok: false, status: res.status, error: errorText };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 408, error: 'VGS delete timeout (30s)' };
    }
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function vgsPurgeAllTokens(
  vaultId: string,
  tokens: { type: 'number' | 'expiry' | 'cvv'; value: string }[]
): Promise<Map<string, VGSDeleteResult>> {
  const results = new Map<string, VGSDeleteResult>();

  for (const { type, value } of tokens) {
    const result = await vgsDeleteToken(vaultId, value);
    results.set(type, result);

    if (!result.ok && result.status !== 404) {
      break;
    }
  }

  return results;
}

export function getVGSManagementBaseUrl(): string {
  return VGS_MANAGEMENT_BASE;
}