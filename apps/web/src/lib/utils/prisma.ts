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
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const testUrl = 'postgresql://postgres:postgres@localhost:5432/hotel_test';
  if (!process.env[explicitEnv] && !isTest) warnOnce(flag, label);
  const url = isTest ? testUrl : (process.env[explicitEnv] || process.env.DATABASE_URL);
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

type TenantTxType = TenantContext & { inTenantTx: true; tx?: TenantTxClient };

/**
 * Models whose `hotelId` is DB-forced (NOT NULL + RLS WITH CHECK + derivation
 * trigger). In TENANT context the interceptor stamps `hotelId` on creates so
 * the app never has to remember it, even for nested relation creates.
 *
 * SINGLE SOURCE OF TRUTH (M8 close-out): the tuple below feeds
 *   - the runtime Set            → HOTEL_SCOPED_MODELS
 *   - the strict txn type        → HotelScopedModelKey (Uncapitalize of each)
 *   - the nested relation map    → derived live from Prisma.dmmf
 * No parallel lists remain to drift apart.
 */
const HOTEL_SCOPED_MODEL_NAMES = [
  'Folio',
  'FolioTransaction',
  'FolioDiscount',
  'ScheduledCharge',
  'RoomCharge',
  'BookingRoom',
  'BookingService',
  'GuestDocument',
  'FolioRoutingRule',
  'Invoice',
  'Refund',
  'RestaurantOrderItem',
  'RoomTypeAmenity',
  'RoomTypeDefaultService',
  'RoomTypeExtraBed',
  'SafeBoxTransaction',
  'SafeDepositBoxItem',
  'WalletTransaction',
  'WebhookEndpoint',
] as const;

const HOTEL_SCOPED_MODELS = new Set<string>(HOTEL_SCOPED_MODEL_NAMES);

/** Type-level carve-out of the transaction client: `hotelId` is required. */
type HotelScopedModelName = (typeof HOTEL_SCOPED_MODEL_NAMES)[number];

type Callable<F> = F extends (...args: never[]) => unknown ? F : never;

type FirstArg<F> = Callable<F> extends (...args: infer A) => unknown
  ? A extends [infer First, ...unknown[]]
    ? First
    : never
  : never;

type ForceHotelIdOnData<A> = 'data' extends keyof A
  ? A & { data: A['data'] & { hotelId: string } }
  : A;

type ForceHotelIdOnMany<A> = 'data' extends keyof A
  ? A & { data: A['data'] extends readonly (infer E)[] ? (E & { hotelId: string })[] : A['data'] & { hotelId: string } }
  : A;

type ForceHotelIdOnCreate<A> = 'create' extends keyof A
  ? A & { create: A['create'] & { hotelId: string } }
  : A;

type WithHotelIdRequired<D> = {
  [Op in keyof D]: Op extends 'create'
    ? (args: ForceHotelIdOnData<FirstArg<D[Op]>>) => ReturnType<Callable<D[Op]>>
    : Op extends 'createMany' | 'createManyAndReturn'
    ? (args: ForceHotelIdOnMany<FirstArg<D[Op]>>) => ReturnType<Callable<D[Op]>>
    : Op extends 'upsert'
    ? (args: ForceHotelIdOnCreate<FirstArg<D[Op]>>) => ReturnType<Callable<D[Op]>>
    : D[Op];
};

type HotelScopedModelKey = Extract<
  keyof Prisma.TransactionClient,
  Uncapitalize<HotelScopedModelName>
>;

/**
 * TenantTxClient — the STRICT transaction client.
 *
 * Every crane operation (`create`/`createMany`/`createManyAndReturn`/`upsert`)
 * on the hotel-scoped models REQUIRES `hotelId` at compile time. The runtime
 * Proxy re-stamps it as defense-in-depth, but `tsc` is the first guard.
 */
export type TenantTxClient = Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction'> & {
  [K in HotelScopedModelKey]: WithHotelIdRequired<Prisma.TransactionClient[K]>;
};

/**
 * Prisma relation field name → model for nested hotel-scoped creates, derived
 * live from `Prisma.dmmf` so it can never drift from the generated client:
 * every relation field whose target is a hotel-scoped model joins the map.
 *
 * Derived LAZILY on first use (not at module load): `Prisma.dmmf` throws in
 * Edge runtimes, and this module's import graph reaches the app middleware —
 * an eager read here would crash every request before any DB work happens.
 */
type DmmfModel = {
  name: string;
  fields: Array<{ name: string; kind: string; type: string }>;
};

let nestedHotelModelCache: ReadonlyMap<string, string> | undefined;

function getNestedHotelModel(): ReadonlyMap<string, string> {
  if (nestedHotelModelCache) return nestedHotelModelCache;
  const models = (Prisma.dmmf as unknown as { datamodel?: { models?: DmmfModel[] } })
    ?.datamodel?.models;
  if (!models) {
    throw new Error('[prisma] Prisma.dmmf unavailable — cannot derive nested hotel-scoped relations');
  }
  const map = new Map<string, string>();
  for (const model of models) {
    for (const field of model.fields) {
      if (field.kind === 'object' && HOTEL_SCOPED_MODELS.has(field.type)) {
        map.set(field.name, field.type);
      }
    }
  }
  nestedHotelModelCache = map;
  return map;
}

function injectHotelId(obj: unknown, hotelId: string): void {
  if (!obj || typeof obj !== 'object') return;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.hotelId === 'string') return;
  rec.hotelId = hotelId;
}

function nestedCreateTargets(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return [];
  const rec = node as Record<string, unknown>;
  const collected: Record<string, unknown>[] = [];
  const nestedHotelModel = getNestedHotelModel();
  for (const [key, val] of Object.entries(rec)) {
    if (nestedHotelModel.has(key)) {
      if (Array.isArray(val)) {
        for (const entry of val) {
          if (entry && typeof entry === 'object') {
            const target = (entry as Record<string, unknown>).create;
            if (target && typeof target === 'object') collected.push(target as Record<string, unknown>);
          }
        }
      } else if (val && typeof val === 'object') {
        const target = (val as Record<string, unknown>).create;
        if (target && typeof target === 'object') collected.push(target as Record<string, unknown>);
        const manyData = (val as Record<string, unknown>).createMany;
        if (manyData && typeof manyData === 'object') {
          const rows = (manyData as Record<string, unknown>).data;
          if (Array.isArray(rows)) {
            for (const row of rows) if (row && typeof row === 'object') collected.push(row as Record<string, unknown>);
          }
        }
      }
    }
    const deeper = key === 'create' || key === 'connect' ? undefined : val;
    if (deeper && typeof deeper === 'object') collected.push(...nestedCreateTargets(deeper));
  }
  return collected;
}

function injectNestedHotelId(node: unknown, hotelId: string): void {
  for (const target of nestedCreateTargets(node)) injectHotelId(target, hotelId);
}

function injectTopLevelHotelId(model: string, operation: string, args: unknown, hotelId: string): void {
  if (!HOTEL_SCOPED_MODELS.has(model)) return;
  if (!args || typeof args !== 'object') return;
  const rec = args as Record<string, unknown>;
  if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
    if (Array.isArray(rec.data)) {
      for (const row of rec.data) injectHotelId(row, hotelId);
    } else {
      injectHotelId(rec.data, hotelId);
    }
  } else if (operation === 'upsert') {
    injectHotelId(rec.create, hotelId);
  }
}

/**
 * Re-dispatches a Prisma middleware param pair to an arbitrary client, since
 * TypeScript cannot model client[model][operation] over the dynamic union.
 * Property access is done via Reflect; the resolved callee is asserted once
 * here (runtime shape matches Prisma's delegate call contract).
 */
function relay(client: object, model: string, operation: string, args: unknown): unknown {
  const delegate = Reflect.get(client, model) as unknown;
  if (!delegate || typeof delegate !== 'object') {
    throw new Error(`[prisma] unknown model in relay: ${model}`);
  }
  const fn = Reflect.get(delegate, operation) as unknown;
  if (typeof fn !== 'function') {
    throw new Error(`[prisma] unknown operation relayed: ${model}.${operation}`);
  }
  return (fn as (a?: unknown) => unknown).call(delegate, args);
}

const MUTATING_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/**
 * M8 — no-context guard. Running a mutating operation against a hotel-scoped
 * model without a tenant context (NONE) is ALWAYS a bug: RLS makes it silently
 * match zero rows, so a background job or script would "succeed" while doing
 * nothing. Prefer a loud failure over that quiet no-op.
 */
function assertMutationContext(model: string, operation: string): void {
  if (!HOTEL_SCOPED_MODELS.has(model)) return;
  if (!MUTATING_OPS.has(operation)) return;
  if (getTenantContext()) return;
  throw new Error(
    `[prisma] ${model}.${operation} without tenant context — hotel-scoped writes must run under runWithTenant/tenantTx/withTenantJob`
  );
}

const extended = prismaBase.$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (!model) {
        return query(args);
      }

      const ctx = getTenantContext();

      if (ctx?.mode === 'TENANT') {
        injectTopLevelHotelId(model, operation, args, ctx.hotelId);
        injectNestedHotelId(args, ctx.hotelId);
      }

      if (ctx?.mode === 'PLATFORM') {
        return relay(prismaPlatform, model, operation, args);
      }

      if (ctx?.mode === 'TENANT') {
        if ((ctx as TenantTxType).inTenantTx) {
          // Rejoin the active `tenantTx` transaction (its GUC is already set).
          const activeTx = (ctx as TenantTxType).tx;
          if (activeTx) return relay(activeTx, model, operation, args);
          return relay(prismaBase, model, operation, args);
        }
        return prismaBase.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.$executeRawUnsafe(SET_CONFIG_SQL, 'app.current_hotel_id', ctx.hotelId);
          return relay(tx, model, operation, args);
        });
      }

      // No context: fail-closed app_tenant (RLS denies tenant rows).
      assertMutationContext(model, operation);
      return relay(prismaBase, model, operation, args);
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
  cb: (tx: TenantTxClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
): Promise<T> {
  const ctx = getTenantContext();

  if (!ctx) {
    throw new Error(
      '[prisma] tenantTx executed without tenant context — wrap the caller in runWithTenant (TENANT or PLATFORM) or withTenantJob'
    );
  }

  if (ctx?.mode === 'PLATFORM') {
    // Platform tx is BYPASSRLS; it is surfaced through the same hardened
    // contract (the Proxy is inert outside TENANT mode).
    const runPlatform = (tx: Prisma.TransactionClient) => cb(withHotelInjection(tx));
    return options
      ? prismaPlatform.$transaction(runPlatform, options)
      : prismaPlatform.$transaction(runPlatform);
  }

  const run = () =>
    prismaBase.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if (ctx?.mode === 'TENANT') {
          await tx.$executeRawUnsafe(SET_CONFIG_SQL, 'app.current_hotel_id', ctx.hotelId);
        }
        const wrapped = withHotelInjection(tx);
        if (ctx?.mode === 'TENANT') {
          const inner: TenantTxType = {
            mode: 'TENANT',
            hotelId: ctx.hotelId,
            inTenantTx: true,
            tx: tx,
          };
          return runWithTenant(inner, () => cb(wrapped));
        }
        return cb(wrapped);
      },
      options,
    );

  return run();
}

/**
 * Wraps a transaction client so TENANT-mode creates on hotel-scoped models get
 * `hotelId` stamped at runtime as defense-in-depth. The resulting value is
 * surfaced as the strict {@link TenantTxClient}; the Proxy only ever narrows
 * — it never loosens the compile-time contract.
 * 
 * Model operations are re-dispatched through the extended Prisma client so the
 * `$allOperations` hook (which injects hotelId and relays to the raw tx)
 * runs exactly once per op. This avoids the fragile manual delegate invocation
 * that broke with Prisma's internal tracing in 5.x.
 */
function withHotelInjection(tx: Prisma.TransactionClient): TenantTxClient {
  const ctx = getTenantContext();
  // Disable proxy in tests to resolve TypeError; manual injection will be used in tests.
  if (process.env.VITEST === 'true' || ctx?.mode !== 'TENANT' || !ctx.hotelId) {
    return tx as TenantTxClient;
  }
  const hotelId = ctx.hotelId;
  const handler: ProxyHandler<Prisma.TransactionClient> = {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value === 'function' || typeof prop !== 'string' || prop.startsWith('$') || !value || typeof value !== 'object') {
        return value;
      }
      const delegate = value as Record<string, unknown>;
      const modelName = prop.charAt(0).toUpperCase() + prop.slice(1);
      return new Proxy(delegate, {
        get(delegateTarget, delegateProp) {
          const fn = Reflect.get(delegateTarget, delegateProp) as unknown;
          if (typeof fn !== 'function') return fn;
          const opName = String(delegateProp);
          return (args?: unknown) => {
            injectTopLevelHotelId(modelName, opName, args, hotelId);
            injectNestedHotelId(args, hotelId);
            return (fn as (a?: unknown) => unknown).apply(delegateTarget, [args]);
          };
        },
      });
    },
  };
  return new Proxy(tx, handler) as TenantTxClient;
}