import { AsyncLocalStorage } from 'async_hooks';

/**
 * M8 — Per-request tenancy context (AsyncLocalStorage).
 *
 * Holds one of two modes for the current execution span:
 *  - `TENANT`   → the `prisma` client runs as `app_tenant` (RLS-ENFORCED) and
 *                 stamps `app.current_hotel_id` so row-level policies scope
 *                 every query to {@link TenantContext.hotelId}.
 *  - `PLATFORM` → the `prisma` client delegates to the `app_platform`
 *                 connection (BYPASSRLS) for platform-wide / global-table work
 *                 (identity, Super-Admin, invitations, webhook bootstrap).
 *
 * The context is set at REST/Webhook/Worker boundaries and propagates through
 * `await` chains automatically. The DB (RLS) remains the authority — this class
 * only steers WHICH connection + GUC a request uses, never what it may read.
 */
export type TenantContext =
  | { mode: 'TENANT'; hotelId: string }
  | { mode: 'PLATFORM' };

const als = new AsyncLocalStorage<TenantContext | undefined>();

/** Runs `fn` under the supplied tenancy context (returns `fn`'s promise). */
export function runWithTenant<T>(
  ctx: TenantContext | undefined,
  fn: () => T | Promise<T>
): Promise<T> {
  return als.run(ctx, () => Promise.resolve().then(() => fn())) as Promise<T>;
}

/** Reads the tenancy context of the current execution span (undefined outside any span). */
export function getTenantContext(): TenantContext | undefined {
  return als.getStore();
}

/** The hotelId for the current span, when it is in TENANT mode. */
export function getTenantHotelId(): string | undefined {
  const ctx = als.getStore();
  return ctx?.mode === 'TENANT' ? ctx.hotelId : undefined;
}

/**
 * Sets the ambient tenancy context for the CURRENT async execution span
 * (unlike {@link runWithTenant}, which scopes a callback). Boundaries that
 * already own the request/test lifecycle use this to establish context once
 * and let every subsequent `await` inherit it.
 *
 * Production code should prefer `runWithTenant`/`tenantTx`; this is the
 * primitive the test harness uses to emulate a request boundary per test.
 */
export function enterTenantContext(ctx: TenantContext | undefined): void {
  als.enterWith(ctx);
}