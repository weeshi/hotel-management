import { beforeEach, afterEach } from 'vitest';
import { enterTenantContext } from '@/lib/tenant/runtime-context';

// --- Test database wiring -------------------------------------------------
// All three engines (app_tenant / app_platform / universal) point at the same
// local `hotel_test` database; the superuser role bypasses RLS so tests can
// seed any tenant. Tenancy correctness is exercised explicitly by the
// multi-tenancy isolation + E2E suites.
const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_test';
process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DB_URL;
process.env.APP_DATABASE_URL = process.env.APP_DATABASE_URL || TEST_DB_URL;
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || TEST_DB_URL;
delete (globalThis as any).prisma;

// --- Ambient tenancy context ---------------------------------------------
// Every test runs as if inside a request boundary for the canonical seeded
// hotel (`seedTestData` uses id `test-hotel`). This lets services that call
// `tenantTx` and Prisma's hotelId injection behave exactly as they do in
// production, without each test having to wrap itself in `asTenant`.
//
// Tests that operate on another tenant or on the platform can override the
// span with `asTenant(hotelId, fn)` / `asPlatform(fn)`.
export const TEST_HOTEL_ID = 'test-hotel';

beforeEach(() => {
  enterTenantContext({ mode: 'TENANT', hotelId: TEST_HOTEL_ID });
});

afterEach(() => {
  enterTenantContext(undefined);
});
