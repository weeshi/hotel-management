import { ensureDatabase, pushSchema } from '../tests/e2e/setup/db';

ensureDatabase();
pushSchema();
console.log('[e2e:prepare-db] hotel_e2e schema is up to date');
