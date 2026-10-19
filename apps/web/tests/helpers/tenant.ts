import { runWithTenant, type TenantContext } from '@/lib/tenant/runtime-context';

/**
 * M10 — Test tenancy helpers.
 * Wraps test code in a tenant context so services using tenantTx / prisma
 * execute under TENANT (with hotelId) or PLATFORM mode.
 */
export function asTenant<T>(
  hotelId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const ctx: TenantContext = { mode: 'TENANT', hotelId };
  return runWithTenant(ctx, fn);
}

export function asPlatform<T>(fn: () => T | Promise<T>): Promise<T> {
  const ctx: TenantContext = { mode: 'PLATFORM' };
  return runWithTenant(ctx, fn);
}