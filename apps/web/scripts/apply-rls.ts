/**
 * M8 — Idempotent Row-Level Security bootstrap.
 *
 * Applies, for a single database:
 *   1. `public.app_hotel_id()` helper resolved from the `app.current_hotel_id`
 *      session GUC (unset → NULL → no rows → fail closed).
 *   2. tenant-scoped tables (have `hotelId`) → `tenant_isolation` policy.
 *   3. global tables (Hotel + RefreshToken / OtpChallenge / PlatformAuditLog /
 *      BookingNumberCounter) → `allow_all` policy.
 *   4. child tables without `hotelId` (RoomCharge-children, BookingRoom, Refund,
 *      WalletTransaction, …) → `tenant_derived` policy built on an EXISTS over
 *      their tenanted parent chain, so an app_tenant session can neither read
 *      nor write rows belonging to another hotel.
 *   5. BEFORE INSERT/UPDATE triggers on the five financial tables that derive
 *      `hotelId` from their parent (Folio→Booking, charge/txn/discount→Folio,
 *      RoomCharge→BookingRoom→Booking) as defense-in-depth.
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

const DERIVED: Record<string, Derivation> = {
  BookingRoom: (t) =>
    `EXISTS (SELECT 1 FROM "Booking" p WHERE p."id" = "${t}"."bookingId" AND p."hotelId" = public.app_hotel_id())`,
  BookingService: (t) =>
    `EXISTS (SELECT 1 FROM "Booking" p WHERE p."id" = "${t}"."bookingId" AND p."hotelId" = public.app_hotel_id())`,
  GuestDocument: (t) =>
    `EXISTS (SELECT 1 FROM "Guest" p WHERE p."id" = "${t}"."guestId" AND p."hotelId" = public.app_hotel_id())`,
  FolioRoutingRule: (t) =>
    `EXISTS (SELECT 1 FROM "GroupBooking" p WHERE p."id" = "${t}"."groupBookingId" AND p."hotelId" = public.app_hotel_id())`,
  Invoice: (t) =>
    `EXISTS (SELECT 1 FROM "Folio" p WHERE p."id" = "${t}"."folioId" AND p."hotelId" = public.app_hotel_id())`,
  Refund: (t) =>
    `EXISTS (SELECT 1 FROM "Payment" p WHERE p."id" = "${t}"."paymentId" AND p."hotelId" = public.app_hotel_id())`,
  RestaurantOrderItem: (t) =>
    `EXISTS (SELECT 1 FROM "RestaurantOrder" p WHERE p."id" = "${t}"."orderId" AND p."hotelId" = public.app_hotel_id())`,
  RoomTypeAmenity: (t) =>
    `EXISTS (SELECT 1 FROM "RoomType" p WHERE p."id" = "${t}"."roomTypeId" AND p."hotelId" = public.app_hotel_id())`,
  RoomTypeDefaultService: (t) =>
    `EXISTS (SELECT 1 FROM "RoomType" p WHERE p."id" = "${t}"."roomTypeId" AND p."hotelId" = public.app_hotel_id())`,
  RoomTypeExtraBed: (t) =>
    `EXISTS (SELECT 1 FROM "RoomType" p WHERE p."id" = "${t}"."roomTypeId" AND p."hotelId" = public.app_hotel_id())`,
  SafeBoxTransaction: (t) =>
    `EXISTS (SELECT 1 FROM "SafeDepositBox" p WHERE p."id" = "${t}"."safeDepositBoxId" AND p."hotelId" = public.app_hotel_id())`,
  SafeDepositBoxItem: (t) =>
    `EXISTS (SELECT 1 FROM "SafeDepositBox" p WHERE p."id" = "${t}"."safeDepositBoxId" AND p."hotelId" = public.app_hotel_id())`,
  WalletTransaction: (t) =>
    `EXISTS (SELECT 1 FROM "Wallet" p WHERE p."id" = "${t}"."walletId" AND p."hotelId" = public.app_hotel_id())`,
  WebhookEndpoint: (t) =>
    `EXISTS (SELECT 1 FROM "ApiPartner" p WHERE p."id" = "${t}"."partnerId" AND p."hotelId" = public.app_hotel_id())`,
};

function tenantPolicy(t: string): string[] {
  const name = JSON.stringify(t);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${name};`,
    `CREATE POLICY tenant_isolation ON ${name} USING ("hotelId" = public.app_hotel_id()) WITH CHECK ("hotelId" = public.app_hotel_id());`,
  ];
}

function globalPolicy(t: string): string[] {
  const name = JSON.stringify(t);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS allow_all ON ${name};`,
    `CREATE POLICY allow_all ON ${name} USING (true) WITH CHECK (true);`,
  ];
}

function derivedPolicy(t: string, expr: string): string[] {
  const name = JSON.stringify(t);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_derived ON ${name};`,
    `CREATE POLICY tenant_derived ON ${name} USING (${expr}) WITH CHECK (${expr});`,
  ];
}

function triggerStatements(): string[] {
  const helpers: Array<[string, string, string, string]> = [
    // [trigger, table, column, funcBody]
    [
      'trg_folio_hotel',
      'Folio',
      'bookingId',
      `NEW."hotelId" := (SELECT b."hotelId" FROM "Booking" b WHERE b."id" = NEW."bookingId");`,
    ],
    [
      'trg_folio_transaction_hotel',
      'FolioTransaction',
      'folioId',
      `NEW."hotelId" := (SELECT f."hotelId" FROM "Folio" f WHERE f."id" = NEW."folioId");`,
    ],
    [
      'trg_folio_discount_hotel',
      'FolioDiscount',
      'folioId',
      `NEW."hotelId" := (SELECT f."hotelId" FROM "Folio" f WHERE f."id" = NEW."folioId");`,
    ],
    [
      'trg_scheduled_charge_hotel',
      'ScheduledCharge',
      'folioId',
      `NEW."hotelId" := (SELECT f."hotelId" FROM "Folio" f WHERE f."id" = NEW."folioId");`,
    ],
    [
      'trg_room_charge_hotel',
      'RoomCharge',
      'bookingRoomId',
      `NEW."hotelId" := (SELECT b."hotelId" FROM "BookingRoom" br JOIN "Booking" b ON b."id" = br."bookingId" WHERE br."id" = NEW."bookingRoomId");`,
    ],
  ];

  const out: string[] = [];
  for (const [trigger, table, column, body] of helpers) {
    const name = JSON.stringify(table);
    const col = JSON.stringify(column);
    out.push(`DROP TRIGGER IF EXISTS ${trigger} ON ${name};`);
    const fn = [
      `CREATE OR REPLACE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$`,
      `BEGIN`,
      `  ${body}`,
      `  IF NEW."hotelId" IS NULL THEN`,
      `    RAISE EXCEPTION 'cannot derive hotelId for ${table}: parent row missing' USING ERRCODE = 'P0001';`,
      `  END IF;`,
      `  RETURN NEW;`,
      `END $$;`,
    ].join('\n');
    out.push(fn);
    out.push(`CREATE TRIGGER ${trigger} BEFORE INSERT OR UPDATE OF ${col} ON ${name} FOR EACH ROW EXECUTE FUNCTION public.${trigger}();`);
  }
  return out;
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
        console.error(`[apply-rls] statement #${i} of ${executable.length} failed:\n${executable[i].slice(0, 600)}`);
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