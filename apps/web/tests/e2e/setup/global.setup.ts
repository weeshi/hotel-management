import { createE2eClient, ensureDatabase, pushSchema, truncateAll } from './db';
import { E2E } from './env';

export default async function globalSetup(): Promise<void> {
  const name = new URL(E2E.databaseUrl).pathname.replace(/^\//, '');
  console.log(`[e2e:setup] provisioning ${name} …`);
  ensureDatabase();
  pushSchema();

  const prisma = createE2eClient();
  try {
    const tables = await truncateAll(prisma);
    console.log(`[e2e:setup] schema applied, truncated ${tables} tables — ready`);
  } finally {
    await prisma.$disconnect();
  }
}
