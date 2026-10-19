/**
 * M8 — Idempotent DB role provisioning for multi-tenancy (Row-Level Security).
 *
 * Creates three app roles:
 *   app_tenant    → RLS-ENFORCED. Every app request runs here; policies scope
 *                   rows to `app.current_hotel_id` (set per transaction).
 *   app_platform  → BYPASSRLS. Platform-wide reads/writes and global tables
 *                   (Super-Admin, invitations, webhook bootstrap, counters).
 *   app_migrator  → BYPASSRLS. Non-DDL maintenance tools / backfills / seeders.
 *
 * Passwords are taken from APP_DB_PASSWORD / PLATFORM_DB_PASSWORD /
 * MIGRATOR_DB_PASSWORD env vars and fall back to the LOCAL-DEV-ONLY values
 * documented in docker-compose.yml. NEVER ship or reuse the local defaults in
 * any real environment.
 *
 * Superuser connection: ADMIN_DATABASE_URL (defaults to DATABASE_URL).
 *
 * Usage:
 *   npx tsx scripts/provision-db-roles.ts
 */
import { Client } from 'pg';

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/hotel_management';

const PASSWORDS = {
  app_tenant: process.env.APP_DB_PASSWORD ?? 'app_tenant_dev_only_2026',
  app_platform: process.env.PLATFORM_DB_PASSWORD ?? 'app_platform_dev_only_2026',
  app_migrator: process.env.MIGRATOR_DB_PASSWORD ?? 'app_migrator_dev_only_2026',
};

function q(v: string): string {
  return v.replace(/'/g, "''");
}

function attrsFor(role: 'app_tenant' | 'app_platform' | 'app_migrator'): string {
  return role === 'app_tenant'
    ? 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
    : 'NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
}

const GRANTS = `
  GRANT USAGE ON SCHEMA public TO app_tenant, app_platform, app_migrator;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_tenant;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_platform;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_platform;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_migrator;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_migrator;

  -- Future objects created by migrations (which run as the superuser) inherit grants.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_tenant;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_platform;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_platform;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_migrator;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_migrator;
`;

export async function provisionRoles(adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    for (const role of ['app_tenant', 'app_platform', 'app_migrator'] as const) {
      const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      if (rowCount === 0) {
        await client.query(
          `CREATE ROLE ${role} LOGIN ${attrsFor(role)} PASSWORD '${q(PASSWORDS[role])}'`
        );
      }
      console.log(`[provision-db-roles] role ready: ${role}`);
    }
    await client.query(GRANTS);
    console.log('[provision-db-roles] grants + default privileges applied');
  } finally {
    await client.end();
  }
}

async function main() {
  await provisionRoles(ADMIN_URL);
}

const isMain = require.main === module;

if (isMain) {
  main().catch((e) => {
    console.error('[provision-db-roles] failed:', e);
    process.exit(1);
  });
}