import { PrismaClient, Prisma } from '@prisma/client';
import {
  getTenantContext,
  runWithTenant,
  type TenantContext,
} from '@/lib/tenant/runtime-context';

/**
 * M8 — Tenancy-aware Prisma clients.
 *
 * THREE engines drive the data tier:
 *
 *   prismaBase     — app_tenant connection (ROW-LEVEL SECURITY MANDATORY).
 *                    Row policies scope every read/write to the tenant set in
 *                    `app.current_hotel_id` (see prisma/rls/rls.sql).
 *   prismaPlatform — app_platform connection (BYPASSRLS). Platform-wide
 *                    identity (Super-Admin OTP, sessions, users), webhook /
 *                    bootstrap lookups and global counters.
 *   prisma         — THE UNIVERSAL CLIENT. Every existing `import { prisma }`
 *                    keeps working unchanged. The `$allOperations` interceptor
 *                    routes by AsyncLocalStorage context:
 *
 *                    TENANT  (bare op)  → opens a transaction on app_tenant,
 *                        sets `app.current_hotel_id` via `set_config(...,
 *                        true)` (transaction-local, pgBouncer-safe), runs the
 *                        op — so the GUC always lands on the SAME connection.
 *                    TENANT  (in tenantTx) → GUC is already set by the outer
 *                        `tenantTx`; the op runs directly inside it (no nesting).
 *                    PLATFORM → delegate to prismaPlatform (BYPASSRLS).
 *                    NONE    → app_tenant WITHOUT any GUC. Mandatory-RLS tables
 *                        FAIL CLOSED (zero rows); global tables stay reachable.
 *                        No context means no tenant permission — never all.
 *
 * Transactional code MUST use `tenantTx(cb)` instead of
 * `prisma.$transaction(cb)` so the GUC is set at transaction start and every
 * `tx.*` op joins the SAME transaction (atomic + RLS-correct).
 *
 * The DB is the real authority — this module only steers which role + GUC a
 * request uses. See docs/M8-RLS-ARCH.md.
 */

const globalForPrisma = globalThis as unknown as {
  __prismaBase?: PrismaClient;
  __prismaPlatform?: PrismaClient;
};

let warnedApp = { value: false };
let warnedPlatform = { value: false };

function warnOnce(flag: { value: boolean }, label: string): void {
  if (!flag.value) {
    flag.value = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[prisma] ${label} uses the superuser DATABASE_URL fallback. ` +
        'Row-Level Security is NOT enforced for this connection — set ' +
        'APP_DATABASE_URL / PLATFORM_DATABASE_URL to run as app_tenant / app_platform.'
    );
  }
}

function createClient(
  explicitEnv: string,
  flag: { value: boolean },
  label: string
): PrismaClient {
  if (!process.env[explicitEnv]) warnOnce(flag, label);
  const url = process.env[explicitEnv] || process.env.DATABASE_URL;
  return new PrismaClient({ datasourceUrl: url });
}

export const prismaBase: PrismaClient =
  globalForPrisma.__prismaBase ?? createClient('APP_DATABASE_URL', warnedApp, 'APP_DATABASE_URL');
export const prismaPlatform: PrismaClient =
  globalForPrisma.__prismaPlatform ?? createClient('PLATFORM_DATABASE_URL', warnedPlatform, 'PLATFORM_DATABASE_URL');

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prismaBase = prismaBase;
  globalForPrisma.__prismaPlatform = prismaPlatform;
}

const SET_CONFIG_SQL = `SELECT set_config($1::text, $2::text, true)`;

type TenantTxType = TenantContext & { inTenantTx: true; tx?: any };

/**
 * Models whose `hotelId` is DB-forced (NOT NULL + RLS WITH CHECK + derivation
 * trigger). In TENANT context the interceptor stamps `hotelId` on creates so
 * the app never has to remember it, even for nested relation creates.
 */
const HOTEL_SCOPED_MODELS = new Set(['Folio', 'FolioTransaction', 'FolioDiscount', 'ScheduledCharge', 'RoomCharge']);

/** Prisma relation field name → model for nested hotel-scoped creates. */
const NESTED_HOTEL_MODEL: Record<string, string> = {
  folio: 'Folio',
  masterFolio: 'Folio',
  transactions: 'FolioTransaction',
  discounts: 'FolioDiscount',
  scheduledCharges: 'ScheduledCharge',
  roomCharges: 'RoomCharge',
};

function injectHotelId(obj: any | null | undefined, hotelId: string): void {
  if (!obj || typeof obj !== 'object' || obj.hotelId) return;
  obj.hotelId = hotelId;
}

function injectNestedHotelId(node: any, hotelId: string): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) injectNestedHotelId(item, hotelId);
    return;
  }
  for (const [key, val] of Object.entries(node)) {
    const value = val as any;
    if (!value || typeof value !== 'object') continue;
    if (key in NESTED_HOTEL_MODEL) {
      if (Array.isArray(value)) {
        for (const entry of value) injectHotelId(entry?.create, hotelId);
      } else {
        injectHotelId(value?.create, hotelId);
        if (Array.isArray(value?.createMany?.data)) {
          for (const d of value.createMany.data) injectHotelId(d, hotelId);
        }
      }
    }
    if (value?.create) injectNestedHotelId(value.create, hotelId);
    else injectNestedHotelId(value, hotelId);
  }
}

function injectTopLevelHotelId(model: string, op: string, args: any, hotelId: string): void {
  if (!HOTEL_SCOPED_MODELS.has(model)) return;
  if (op === 'create') {
    injectHotelId(args.data, hotelId);
  } else if (op === 'createMany' || op === 'createManyAndReturn') {
    const rows = Array.isArray(args.data) ? args.data : [args.data];
    for (const row of rows) injectHotelId(row, hotelId);
  } else if (op === 'upsert') {
    injectHotelId(args.create, hotelId);
  }
}

const extended = prismaBase.$extends({
  query: {
    async $allOperations(this: any, { model, operation, args, query }: any) {
      // Raw queries are never tenant-wrapped: they run on app_tenant without a
      // GUC and are therefore FAIL-CLOSED for RLS-protected tables.
      if (!model) {
        return query(args);
      }

      const ctx = getTenantContext();

      if (ctx?.mode === 'TENANT') {
        injectTopLevelHotelId(model, operation, args, ctx.hotelId);
        injectNestedHotelId(args.data ?? args.create ?? {}, ctx.hotelId);
      }

      if (ctx?.mode === 'PLATFORM') {
        const platform = prismaPlatform as any;
        return platform[model][operation](args);
      }

      if (ctx?.mode === 'TENANT') {
        const base = prismaBase as any;
        if ((ctx as TenantTxType).inTenantTx) {
          // Already inside a `tenantTx` transaction: rejoin it (the GUC was set
          // at its start) via the active transaction client from the context.
          const activeTx = (ctx as TenantTxType).tx;
          if (activeTx) return activeTx[model][operation](args);
          return base[model][operation](args);
        }
        return base.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe(SET_CONFIG_SQL, 'app.current_hotel_id', ctx.hotelId);
          return (tx as any)[model][operation](args);
        });
      }

      // No context: fail-closed app_tenant (RLS denies tenant rows).
      return (prismaBase as any)[model][operation](args);
    },
  },
});

export const prisma = extended as unknown as PrismaClient;

/**
 * Tenancy-aware interactive transaction.
 *
 * Use this instead of `prisma.$transaction(cb)` everywhere DB work happens:
 *  - under TENANT context it sets `app.current_hotel_id` at transaction start
 *    (transaction-local) and marks the span so the interceptor lets every
 *    `tx.*` op join THIS transaction (full atomicity, GUC-ruled);
 *  - under PLATFORM context it runs on the BYPASSRLS platform connection;
 *  - with NO context it runs on app_tenant fail-closed (zero tenant rows).
 */
export async function tenantTx<T>(
  cb: (tx: any) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
): Promise<T> {
  const ctx = getTenantContext();

  if (ctx?.mode === 'PLATFORM') {
    return (
      options ? prismaPlatform.$transaction(cb, options) : prismaPlatform.$transaction(cb)
    ) as unknown as Promise<T>;
  }

  const withHotelInjection = (tx: any): any =>
    ctx?.mode === 'TENANT'
      ? new Proxy(tx, {
          get(target, prop) {
            if (typeof prop !== 'string') return Reflect.get(target, prop);
            const value = Reflect.get(target, prop);
            if (!value || typeof value === 'function') return value;
            if (prop.startsWith('$')) return value;
            return new Proxy(value, {
              get(ops, op: PropertyKey) {
                const fn = Reflect.get(ops, op);
                if (typeof fn !== 'function') return fn;
                const modelName = prop.charAt(0).toUpperCase() + prop.slice(1);
                return (args: any) => {
                  injectTopLevelHotelId(modelName, String(op), args ?? {}, ctx.hotelId);
                  const scope = args?.data ?? args?.create ?? {};
                  injectNestedHotelId(scope, ctx.hotelId);
                  return fn.call(ops, args);
                };
              },
            });
          },
        })
      : tx;

  const run = () =>
    prismaBase.$transaction(
      async (tx: any) => {
        if (ctx?.mode === 'TENANT') {
          await tx.$executeRawUnsafe(SET_CONFIG_SQL, 'app.current_hotel_id', ctx.hotelId);
        }
        const wrapped = withHotelInjection(tx);
        if (ctx?.mode === 'TENANT') {
          const inner: TenantTxType = {
            mode: 'TENANT',
            hotelId: ctx.hotelId,
            inTenantTx: true,
            tx: wrapped as any,
          };
          return runWithTenant(inner, () => cb(wrapped));
        }
        return cb(wrapped);
      },
      options,
    );

  return run();
}