/**
 * M8 — Idempotent Row-Level Security bootstrap.
 *
 * Applies, for a single database:
 *   1. `public.app_hotel_id()` helper resolved from the `app.current_hotel_id`
 *      session GUC (unset → NULL → no rows → fail closed).
 *   2. tenant-scoped tables (have `hotelId`) → `tenant_isolation` policy.
 *   3. global tables (Hotel + RefreshToken / OtpChallenge / PlatformAuditLog /
 *      BookingNumberCounter) → `allow_all` policy.
 *   4. child tables that gained a DB-forced `hotelId` in M8 Phase-1 (5 financial
 *      tables) and M8 Phase-2-b (the 14 formerly-derived children) → direct
 *      `tenant_isolation` policy (same CHECK as any other tenanted table).
 *   5. BEFORE INSERT/UPDATE triggers on all 19 of said tables that derive
 *      `hotelId` from their parent under `SELECT … FOR NO KEY UPDATE SKIP LOCKED`
 *      (deterministic lock order; see scripts/generate-child-hotelid-migration.ts).
 *
 * Every DDL executed here is also written to `prisma/rls/rls.sql` so the exact
 * artifact is reviewable/committed.
 *
 * Superuser connection: ADMIN_DATABASE_URL (defaults to DATABASE_URL).
 * Must run AFTER the schema exists (e.g. after `prisma db push` / migrations)
 * and AFTER `scripts/provision-db-roles.ts` granted the app roles.
 *
 * Usage:
 *   npx tsx scripts/apply-rls.ts
 */
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { childTriggerSqls } from './generate-child-hotelid-migration';

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/hotel_management';

const RLS_ARTIFACT = path.join(__dirname, '..', 'prisma', 'rls', 'rls.sql');

const GLOBAL_ALLOW = new Set([
  'Hotel',
  'RefreshToken',
  'OtpChallenge',
  'PlatformAuditLog',
  'BookingNumberCounter',
]);

type Derivation = (t: string) => string;

/**
 * Only tables that STILL have no hotelId column (and are therefore tenanted
 * purely by derivation) live here. Every model that gained a real `hotelId`
 * column (M8 Phase-1: the 5 financial tables; M8 Phase-2-b: the 14 derived
 * children below) is auto-detected below and given a direct
 * `tenant_isolation` policy instead.
 */
const DERIVED: Record<string, Derivation> = {};

function tenantPolicy(t: string): string[] {
  const name = JSON.stringify(t);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_derived ON ${name};`,
    `DROP POLICY IF EXISTS allow_all ON ${name};`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${name};`,
    `CREATE POLICY tenant_isolation ON ${name} USING ("hotelId" = public.app_hotel_id()) WITH CHECK ("hotelId" = public.app_hotel_id());`,
  ];
}

function globalPolicy(t: string): string[] {
  const name = JSON.stringify(t);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${name};`,
    `DROP POLICY IF EXISTS tenant_derived ON ${name};`,
    `DROP POLICY IF EXISTS allow_all ON ${name};`,
    `CREATE POLICY allow_all ON ${name} USING (true) WITH CHECK (true);`,
  ];
}

function derivedPolicy(t: string, expr: string): string[] {
  const name = JSON.stringify(t);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${name};`,
    `DROP POLICY IF EXISTS allow_all ON ${name};`,
    `DROP POLICY IF EXISTS tenant_derived ON ${name};`,
    `CREATE POLICY tenant_derived ON ${name} USING (${expr}) WITH CHECK (${expr});`,
  ];
}

interface TriggerSpec {
  trigger: string;
  table: string;
  /** Parent lookup chain from the child row to the tenanted ancestor. */
  hops: Array<{ from: string; alias?: string; via: string }>;
  targetCol?: string;
}

/**
 * Derives `hotelId` from the parent chain (e.g. RoomCharge → BookingRoom →
 * Booking) using `SELECT … FOR NO KEY UPDATE … SKIP LOCKED` — deterministic
 * PK-ordered lock acquisition, and never blocks on a parent being
 * concurrently re-homed.
 */
function triggerFunctionBody(spec: TriggerSpec): string {
  const first = spec.hops[0];
  const firstRef = first.alias ?? JSON.stringify(first.from);
  const fromClause = `  FROM ${
    first.alias ? `${first.alias} ${JSON.stringify(first.from)}` : JSON.stringify(first.from)
  }`;
  const joins = spec.hops
    .slice(1)
    .map((h) => `  JOIN ${h.alias ? `${h.alias} ${JSON.stringify(h.from)}` : JSON.stringify(h.from)} ON ${h.via}`);
  const lockCols = spec.hops.map((h) => h.alias ?? JSON.stringify(h.from)).join(', ');
  const orderCols = spec.hops.map((h) => `${h.alias ?? JSON.stringify(h.from)}."id"`).join(', ');
  const target = spec.targetCol ?? `${firstRef}."hotelId"`;

  return [
    'DECLARE',
    '  v_hotel_id text;',
    'BEGIN',
    `  SELECT ${target} INTO v_hotel_id`,
    fromClause,
    ...joins,
    `  WHERE ${first.via}`,
    `   ORDER BY ${orderCols}`,
    `   FOR NO KEY UPDATE OF ${lockCols} SKIP LOCKED;`,
    '  IF v_hotel_id IS NULL THEN',
    `    RAISE EXCEPTION 'cannot derive hotelId for ${spec.table}: parent row missing' USING ERRCODE = 'P0001';`,
    '  END IF;',
    '  NEW."hotelId" := v_hotel_id;',
    '  RETURN NEW;',
    'END;',
  ].join('\n');
}

function renderTrigger(spec: TriggerSpec): string[] {
  const fnName = spec.trigger;
  const table = JSON.stringify(spec.table);
  return [
    `DROP TRIGGER IF EXISTS ${fnName} ON ${table};`,
    [
      `CREATE OR REPLACE FUNCTION public.${fnName}() RETURNS trigger LANGUAGE plpgsql AS $$`,
      triggerFunctionBody(spec),
      `$$;`,
    ].join('\n'),
    `CREATE TRIGGER ${fnName} BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION public.${fnName}();`,
  ];
}

function triggerStatements(): string[] {
  const core: TriggerSpec[] = [
    { trigger: 'trg_folio_hotel', table: 'Folio', hops: [{ from: 'Booking', via: `"Booking"."id" = NEW."bookingId"` }] },
    { trigger: 'trg_folio_transaction_hotel', table: 'FolioTransaction', hops: [{ from: 'Folio', via: `"Folio"."id" = NEW."folioId"` }] },
    { trigger: 'trg_folio_discount_hotel', table: 'FolioDiscount', hops: [{ from: 'Folio', via: `"Folio"."id" = NEW."folioId"` }] },
    { trigger: 'trg_scheduled_charge_hotel', table: 'ScheduledCharge', hops: [{ from: 'Folio', via: `"Folio"."id" = NEW."folioId"` }] },
    {
      trigger: 'trg_room_charge_hotel',
      table: 'RoomCharge',
      hops: [
        { from: 'BookingRoom', alias: 'br', via: 'br."id" = NEW."bookingRoomId"' },
        { from: 'Booking', alias: 'b', via: 'b."id" = br."bookingId"' },
      ],
      targetCol: 'b."hotelId"',
    },
  ];

  return [
    '-- Core hotel-scoped triggers (M8 Phase-1; rewired to locked derivation).',
    ...core.flatMap(renderTrigger),
    '-- Derived-child triggers (M8 Phase-2-b; single source of truth: generate-child-hotelid-migration.ts).',
    ...childTriggerSqls(),
  ];
}

export async function applyRls(adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  const statements: string[] = [];
  statements.push('-- M8 RLS — generated by scripts/apply-rls.ts (idempotent)');
  statements.push('-- Target DB: ' + adminUrl.replace(/:[^:@/]+@/, ':***@'));
  statements.push('');
  statements.push(`CREATE OR REPLACE FUNCTION public.app_hotel_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_hotel_id', true), '') $$;`);
  statements.push('');

  try {
    // 1. Tenanted tables (have a hotelId column).
    const { rows: tenanted } = await client.query(
      `SELECT t.tablename
         FROM pg_tables t
         JOIN information_schema.columns c
           ON c.table_schema = t.schemaname AND c.table_name = t.tablename AND c.column_name = 'hotelId'
        WHERE t.schemaname = 'public'
          AND t.tablename NOT LIKE '\\_prisma%'
        ORDER BY t.tablename`
    );
    const tenantTables = tenanted.map((r) => r.tablename as string).filter((t) => !GLOBAL_ALLOW.has(t) && !t.startsWith('_prisma'));
    for (const t of tenantTables) {
      statements.push(...tenantPolicy(t), '');
    }

    // 2. Tables without hotelId that are tenants by derivation.
    const { rows: noCol } = await client.query(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE '\\_prisma%'
        ORDER BY tablename`
    );
    const unclassified = (noCol.map((r) => r.tablename as string)).filter((t) => !t.startsWith('_prisma') && !tenantTables.includes(t) && !GLOBAL_ALLOW.has(t));
    for (const t of unclassified) {
      const derive = DERIVED[t];
      if (!derive) {
        throw new Error(`[apply-rls] table "${t}" has no hotelId column and no derivation mapping — refusing to leave it unprotected`);
      }
      statements.push(...derivedPolicy(t, derive(t)), '');
    }

    // 3. Global tables (Hotel + system-wide auth/session types).
    for (const t of [...GLOBAL_ALLOW].sort()) {
      statements.push(...globalPolicy(t), '');
    }
    statements.push(...triggerStatements(), '');

    const sql = statements.join('\n');

    fs.mkdirSync(path.dirname(RLS_ARTIFACT), { recursive: true });
    fs.writeFileSync(RLS_ARTIFACT, sql, 'utf8');

    const executable = statements.filter((s) => s.trim() !== '' && !s.trim().startsWith('--'));
    for (let i = 0; i < executable.length; i++) {
      try {
        await client.query(executable[i]);
      } catch (err) {
        console.error(`[apply-rls] statement #${i} of ${executable.length} failed:\n${executable[i]}`);
        throw err;
      }
    }

    console.log(`[apply-rls] policies applied: ${tenantTables.length} tenant, ${unclassified.length} derived, ${GLOBAL_ALLOW.size} global`);
    console.log(`[apply-rls] artifact written: ${RLS_ARTIFACT}`);
  } finally {
    await client.end();
  }
}

async function main() {
  await applyRls(ADMIN_URL);
}

const isMain = require.main === module;

if (isMain) {
  main().catch((e) => {
    console.error('[apply-rls] failed:', e);
    process.exit(1);
  });
}