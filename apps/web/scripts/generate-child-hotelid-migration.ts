/**
 * M8 Phase 2-b — hotelId for the derived child tables.
 *
 * The 14 tables below exist beneath tenanted parents but have no `hotelId`
 * of their own (M8 Phase-1 enforced tenancy on them via `tenant_derived`
 * EXISTS policies). This generator:
 *
 *   1. EMITS a hand-written migration
 *      `prisma/migrations/<MIGRATION_NAME>/migration.sql` that, per table:
 *        a. ADD COLUMN IF NOT EXISTS "hotelId" TEXT;
 *        b. backfill from the parent (UPDATE … FROM);
 *        c. SET NOT NULL (fails loudly on orphans);
 *        d. FK → "Hotel" ON DELETE RESTRICT ON UPDATE CASCADE;
 *        e. CREATE INDEX IF NOT EXISTS on "hotelId";
 *        f. BEFORE INSERT OR UPDATE OF <fk> trigger that derives "hotelId"
 *           from the parent with `SELECT … FOR NO KEY UPDATE SKIP LOCKED`
 *           (board mandate: deterministic lock order, never block on a parent
 *           row that is being concurrently re-assigned to another hotel).
 *   2. APPLIES that migration (idempotent) to every database below, in the
 *      order: ADMIN_URL (hotel_management) then E2E_DATABASE_URL (hotel_e2e).
 *      Run with `--dry-run` to only re-emit the file.
 *
 * The DB stays the authority: `prisma db push` (the migration flow this repo
 * already uses) simply syncs afterward, and apply-rls moves these tables from
 * `tenant_derived` to direct `tenant_isolation`.
 *
 * Usage:
 *   npx tsx scripts/generate-child-hotelid-migration.ts [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/hotel_management';
const E2E_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/hotel_e2e';
const PSQL_BIN =
  process.env.PSQL_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

const MIGRATION_NAME = '20260926000000_add_derived_child_hotel_id';
const MIGRATION_DIR = path.join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME
);
const MIGRATION_FILE = path.join(MIGRATION_DIR, 'migration.sql');

interface ParentSpec {
  fk: string;
  ref: string;
}

interface TableSpec {
  model: string;
  parents: ParentSpec[];
}

/**
 * Exactly mirrors the DERIVED map in scripts/apply-rls.ts — single source of
 * truth for the 14 derived children. Invoice derives via either of its two
 * optional parents (folio OR external client).
 */
const DERIVED_CHILDREN: TableSpec[] = [
  { model: 'BookingRoom', parents: [{ fk: 'bookingId', ref: 'Booking' }] },
  { model: 'BookingService', parents: [{ fk: 'bookingId', ref: 'Booking' }] },
  { model: 'GuestDocument', parents: [{ fk: 'guestId', ref: 'Guest' }] },
  {
    model: 'FolioRoutingRule',
    parents: [{ fk: 'groupBookingId', ref: 'GroupBooking' }],
  },
  {
    model: 'Invoice',
    parents: [
      { fk: 'folioId', ref: 'Folio' },
      { fk: 'externalClientId', ref: 'ExternalClient' },
    ],
  },
  { model: 'Refund', parents: [{ fk: 'paymentId', ref: 'Payment' }] },
  {
    model: 'RestaurantOrderItem',
    parents: [{ fk: 'orderId', ref: 'RestaurantOrder' }],
  },
  { model: 'RoomTypeAmenity', parents: [{ fk: 'roomTypeId', ref: 'RoomType' }] },
  {
    model: 'RoomTypeDefaultService',
    parents: [{ fk: 'roomTypeId', ref: 'RoomType' }],
  },
  { model: 'RoomTypeExtraBed', parents: [{ fk: 'roomTypeId', ref: 'RoomType' }] },
  {
    model: 'SafeBoxTransaction',
    parents: [{ fk: 'safeDepositBoxId', ref: 'SafeDepositBox' }],
  },
  {
    model: 'SafeDepositBoxItem',
    parents: [{ fk: 'safeDepositBoxId', ref: 'SafeDepositBox' }],
  },
  { model: 'WalletTransaction', parents: [{ fk: 'walletId', ref: 'Wallet' }] },
  {
    model: 'WebhookEndpoint',
    parents: [{ fk: 'partnerId', ref: 'ApiPartner' }],
  },
];

function snake(model: string): string {
  return model
    .replace(/([A-Z])/g, (m) => `_${m}`)
    .replace(/^_/, '')
    .toLowerCase();
}

function q(name: string): string {
  return JSON.stringify(name);
}

/** DDL that adds + backfills + hardens hotelId for one child table. */
function columnSql(spec: TableSpec): string[] {
  const table = q(spec.model);
  const [parent] = spec.parents;
  const lines: string[] = [];
  lines.push(`-- ${spec.model}: derive "hotelId" from ${parent.ref}.${parent.fk}`);
  lines.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "hotelId" TEXT;`);
  for (const p of spec.parents) {
    lines.push(
      `UPDATE ${table} SET "hotelId" = p."hotelId" FROM ${q(p.ref)} p WHERE ${table}.${q(p.fk)} = p."id";`
    );
  }
  lines.push(`ALTER TABLE ${table} ALTER COLUMN "hotelId" SET NOT NULL;`);
  lines.push(
    `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${spec.model}_hotelId_fkey";`
  );
  lines.push(
    `ALTER TABLE ${table} ADD CONSTRAINT "${spec.model}_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`
  );
  lines.push(`CREATE INDEX IF NOT EXISTS "${spec.model}_hotelId_idx" ON ${table} ("hotelId");`);
  return lines;
}

/**
 * Trigger body: read the parent's hotelId with
 * `SELECT … FOR NO KEY UPDATE <parent> SKIP LOCKED` (board mandate). For a
 * table with several optional parents (Invoice), probe them in declaration
 * order and only fall through when the FK is actually set.
 */
function triggerFunctionBody(spec: TableSpec): string {
  const lines: string[] = ['DECLARE', '  v_hotel_id text;', 'BEGIN'];
  spec.parents.forEach((p, i) => {
    if (i > 0) {
      lines.push(`  IF v_hotel_id IS NULL AND NEW.${q(p.fk)} IS NOT NULL THEN`);
    }
    lines.push(
      `  SELECT ${q(p.ref)}."hotelId" INTO v_hotel_id`,
      `    FROM ${q(p.ref)}`,
      `   WHERE ${q(p.ref)}."id" = NEW.${q(p.fk)}`,
      `   ORDER BY ${q(p.ref)}."id"`,
      `   FOR NO KEY UPDATE OF ${q(p.ref)} SKIP LOCKED;`
    );
    if (i > 0) {
      lines.push('  END IF;');
    }
  });
  lines.push('  IF v_hotel_id IS NULL THEN');
  lines.push(
    `    RAISE EXCEPTION 'cannot derive hotelId for ${spec.model}: parent row missing' USING ERRCODE = 'P0001';`
  );
  lines.push('  END IF;');
  lines.push('  NEW."hotelId" := v_hotel_id;');
  lines.push('  RETURN NEW;');
  lines.push('END;');
  return lines.join('\n');
}

function triggerSql(spec: TableSpec): string[] {
  const table = q(spec.model);
  const fnName = `trg_${snake(spec.model)}_hotel`;
  const fkCols = spec.parents.map((p) => q(p.fk)).join(', ');
  return [
    `DROP TRIGGER IF EXISTS ${fnName} ON ${table};`,
    [
      `CREATE OR REPLACE FUNCTION public.${fnName}() RETURNS trigger LANGUAGE plpgsql AS $$`,
      triggerFunctionBody(spec),
      `$$;`,
    ].join('\n'),
    `CREATE TRIGGER ${fnName} BEFORE INSERT OR UPDATE OF ${fkCols} ON ${table} FOR EACH ROW EXECUTE FUNCTION public.${fnName}();`,
  ];
}

/**
 * The 14 "derived child" trigger definitions (DROP + FUNCTION + CREATE
 * TRIGGER), consumed both by the migration artifact and by scripts/apply-rls.ts
 * so the RLS bootstrap on a fresh `prisma db push` database is byte-identical
 * to what the hand-written migration installs.
 */
export function childTriggerSqls(): string[] {
  const out: string[] = [];
  for (const spec of DERIVED_CHILDREN) {
    out.push(`-- ${spec.model}`, ...triggerSql(spec));
  }
  return out;
}

/** Public mirror of the 14-table derivation map (single source of truth). */
export function derivedChildTables(): TableSpec[] {
  return DERIVED_CHILDREN;
}

function buildMigrationSql(): string {
  const out: string[] = [];
  out.push(
    '-- M8 Phase 2-b — hand-written: hotelId for the 14 derived child tables.'
  );
  out.push('-- Generated by scripts/generate-child-hotelid-migration.ts (idempotent).');
  out.push('-- Parent ships the column; the triggers below re-derive it under lock.');
  out.push('');
  for (const spec of DERIVED_CHILDREN) {
    out.push(...columnSql(spec), '');
  }
  out.push('-- Defense-in-depth triggers: derive hotelId under FOR NO KEY UPDATE SKIP LOCKED.');
  out.push(...childTriggerSqls());
  return out.join('\n');
}

function applyTo(url: string): void {
  const res = spawnSync(
    PSQL_BIN,
    [url, '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION_FILE],
    { stdio: 'inherit' }
  );
  if (res.status !== 0) {
    throw new Error(`[child-hotelid] psql failed against ${url.replace(/:[^:@/]+@/, ':***@')} (exit ${res.status})`);
  }
  console.log(`[child-hotelid] applied → ${url.replace(/:[^:@/]+@/, ':***@')}`);
}

function main() {
  const sql = buildMigrationSql();
  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  fs.writeFileSync(MIGRATION_FILE, sql, 'utf8');
  console.log(`[child-hotelid] wrote ${MIGRATION_FILE}`);
  console.log(`[child-hotelid] tables: ${DERIVED_CHILDREN.map((t) => t.model).join(', ')}`);

  if (process.argv.includes('--dry-run')) {
    console.log('[child-hotelid] dry-run — not applying SQL.');
    return;
  }

  applyTo(ADMIN_URL);
  applyTo(E2E_URL);
}

const isMain = require.main === module;
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error('[child-hotelid] failed:', e);
    process.exit(1);
  }
}