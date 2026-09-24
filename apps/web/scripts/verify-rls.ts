/**
 * M8 — RLS census verification against information_schema/pg_catalog.
 *
 * Asserts, on a single database, immutable DDL facts claimed by docs/M8-RLS-ARCH.md:
 *   - policy matrix: 54 tenant_isolation / 0 tenant_derived / 5 allow_all (59 total)
 *   - FORCE ROW LEVEL SECURITY on 59 public tables
 *   - exactly the 19 expected `trg_*_hotel` triggers
 *   - every hotel-scoped table's `_hotelId_fkey` is ON DELETE RESTRICT ON UPDATE CASCADE
 *     (the standard policy: "hotel is immortal" — financial rows never orphan).
 *
 * Export `verifyRls(url)` and it can be called from the E2E bootstrap chain
 * (scripts/e2e-prepare-db.ts) so the RLS state is proven, not just applied.
 *
 * Usage:
 *   npx tsx scripts/verify-rls.ts
 */
import { Client } from 'pg';
import { derivedChildTables } from './generate-child-hotelid-migration';

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/hotel_management';

const EXPECTED_POLICIES = {
  tenant_isolation: 54,
  tenant_derived: 0,
  allow_all: 5,
} as const;

const EXPECTED_FORCE_RLS = 59;

const CORE_FINANCIAL_TABLES = [
  'Folio',
  'FolioTransaction',
  'FolioDiscount',
  'ScheduledCharge',
  'RoomCharge',
];

function snake(model: string): string {
  return model
    .replace(/([A-Z])/g, (m) => `_${m}`)
    .replace(/^_/, '')
    .toLowerCase();
}

function expectedTriggerNames(): Set<string> {
  const names = new Set<string>(CORE_FINANCIAL_TABLES.map((t) => `trg_${snake(t)}_hotel`));
  for (const spec of derivedChildTables()) {
    names.add(`trg_${snake(spec.model)}_hotel`);
  }
  return names;
}

function hotelScopedTables(): string[] {
  const derived = derivedChildTables().map((spec) => spec.model);
  return [...CORE_FINANCIAL_TABLES, ...derived];
}

function renderOk(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${String(k)}=${String(v)}`)
    .join(' ');
}

export async function verifyRls(adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  const failures: string[] = [];
  try {
    const policyRows = await client.query<{ polname: string; cnt: number }>(
      `SELECT polname, count(*)::int AS cnt FROM pg_policy GROUP BY polname`
    );
    const policyCounts: Record<string, number> = {};
    for (const row of policyRows.rows) policyCounts[row.polname] = row.cnt;
    for (const [name, expected] of Object.entries(EXPECTED_POLICIES)) {
      const actual = policyCounts[name] ?? 0;
      if (actual !== expected) {
        failures.push(`policy ${name}: expected ${expected}, got ${actual}`);
      }
    }

    const forceRows = await client.query<{ cnt: number }>(
      `SELECT count(*)::int AS cnt
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relforcerowsecurity`
    );
    if (forceRows.rows[0].cnt !== EXPECTED_FORCE_RLS) {
      failures.push(`FORCE RLS: expected ${EXPECTED_FORCE_RLS}, got ${forceRows.rows[0].cnt}`);
    }

    const triggerRows = await client.query<{ tgname: string }>(
      `SELECT t.tgname AS tgname
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND t.tgname LIKE 'trg\\_%\\_hotel' AND NOT t.tgisinternal`
    );
    const actualTriggers = new Set(triggerRows.rows.map((r) => r.tgname));
    const expectedTriggers = expectedTriggerNames();
    for (const name of expectedTriggers) {
      if (!actualTriggers.has(name)) {
        failures.push(`missing trigger ${name}`);
      }
    }
    if (actualTriggers.size !== expectedTriggers.size) {
      const extra = [...actualTriggers].filter((n) => !expectedTriggers.has(n)).join(', ');
      failures.push(`unexpected triggers: ${extra}`);
    }

    const fkRows = await client.query<{ table_name: string; delete_rule: string; update_rule: string }>(
      `SELECT tc.table_name, rc.delete_rule, rc.update_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.constraint_schema
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.constraint_schema = 'public'
          AND kcu.column_name = 'hotelId'`
    );
    const fkByTable: Record<string, { delete_rule: string; update_rule: string }> = {};
    for (const row of fkRows.rows) {
      fkByTable[row.table_name] = { delete_rule: row.delete_rule, update_rule: row.update_rule };
    }
    for (const table of hotelScopedTables()) {
      const fk = fkByTable[table];
      if (!fk) {
        failures.push(`missing hotelId FK on ${table}`);
      } else if (fk.delete_rule !== 'RESTRICT' || fk.update_rule !== 'CASCADE') {
        failures.push(
          `FK ${table}: expected DELETE RESTRICT / UPDATE CASCADE, got ${fk.delete_rule} / ${fk.update_rule}`
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`[verify-rls] FAILED against ${adminUrl.replace(/:[^:@/]+@/, ':***@')}:\n- ${failures.join('\n- ')}`);
    }

    console.log(
      `[verify-rls] OK against ${adminUrl.replace(/:[^:@/]+@/, ':***@')} — ` +
        renderOk({ ...EXPECTED_POLICIES, forceRls: EXPECTED_FORCE_RLS, triggers: expectedTriggers.size })
    );
  } finally {
    await client.end();
  }
}

async function main() {
  await verifyRls(ADMIN_URL);
}

const isMain = require.main === module;

if (isMain) {
  main().catch((e) => {
    console.error('[verify-rls] failed:', e);
    process.exit(1);
  });
}