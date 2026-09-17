import { createDummyGateway } from '../tests/contracts/dummy-gateway/server';

const port = Number(process.env.E2E_DUMMY_PORT ?? 4400);

async function main(): Promise<void> {
  const gateway = await createDummyGateway({ port });

  async function shutdown(signal: string) {
    console.log(`[e2e-dummy-gateway] ${signal} received — shutting down`);
    await gateway.close();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await gateway.start();
  console.log(`[e2e-dummy-gateway] listening on ${gateway.baseUrl}`);
  console.log(
    '[e2e-dummy-gateway] control plane: POST /__control/{settle,delay,forge,duplicate,fail-create,reset}',
  );
}

void main();
