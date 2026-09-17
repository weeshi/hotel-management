export default async function globalTeardown(): Promise<void> {
  console.log('[e2e:teardown] run complete — webServers will be stopped by Playwright');
}
