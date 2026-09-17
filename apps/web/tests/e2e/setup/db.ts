import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { E2E } from './env';

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PGPASSWORD = 'postgres';

function databaseName(): string {
  return new URL(E2E.databaseUrl).pathname.replace(/^\//, '');
}

/**
 * Creates the E2E database only when missing. We deliberately avoid a blanket
 * DROP/CREATE: Playwright boots `webServer` before `globalSetup`, so the app may
 * already hold a Prisma pool against this database — dropping it would invalidate
 * those connections. Set `E2E_FRESH_DB=1` to force a clean slate.
 */
export function ensureDatabase(): void {
  const name = databaseName();
  const env = { ...process.env, PGPASSWORD };
  const psql = `"${PG_BIN}\\psql.exe" -U postgres -h localhost`;

  if (process.env.E2E_FRESH_DB === '1') {
    execSync(`${psql} -c "DROP DATABASE IF EXISTS ${name} WITH (FORCE);"`, { env, stdio: 'pipe' });
    execSync(`"${PG_BIN}\\createdb.exe" -U postgres -h localhost ${name}`, { env, stdio: 'pipe' });
    return;
  }

  const exists = execSync(
    `${psql} -tAc "SELECT 1 FROM pg_database WHERE datname = '${name}';"`,
    { env, stdio: 'pipe' },
  )
    .toString()
    .trim();
  if (exists !== '1') {
    execSync(`"${PG_BIN}\\createdb.exe" -U postgres -h localhost ${name}`, { env, stdio: 'pipe' });
  }
}

export function pushSchema(): void {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
    stdio: 'pipe',
  });
}

export function createE2eClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: E2E.databaseUrl } } });
}

/**
 * Truncates every table in the public schema in a single statement, derived from
 * the live catalog instead of a hand-maintained list (no drift when the Prisma
 * schema gains a model). The `_prisma_migrations` bookkeeping table is preserved.
 */
export async function truncateAll(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '%prisma%'
  `;
  if (rows.length === 0) return 0;
  const qualified = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`);
  return rows.length;
}
