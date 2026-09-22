import { ensureDatabase, pushSchema } from '../tests/e2e/setup/db';
import { E2E } from '../tests/e2e/setup/env';
import { provisionRoles } from './provision-db-roles';
import { applyRls } from './apply-rls';

async function main() {
  ensureDatabase();
  await provisionRoles(E2E.databaseUrl);
  pushSchema();
  await applyRls(E2E.databaseUrl);
  console.log('[e2e:prepare-db] hotel_e2e roles + schema + RLS ready');
}

main().catch((e) => {
  console.error('[e2e:prepare-db] failed:', e);
  process.exit(1);
});
