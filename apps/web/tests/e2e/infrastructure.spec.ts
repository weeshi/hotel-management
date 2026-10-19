import { test, expect } from '@playwright/test';
import { CONTRACT_SECRETS, plutuSign } from '../contracts/shared/signer';
import { APP_BASE, DUMMY_BASE } from './setup/env';

// E2E.1 — infrastructure smoke only. Payment journeys land in E2E.2.
test.describe('E2E infrastructure', () => {
  test('Next.js app answers its health probe', async ({ request }) => {
    const res = await request.get(`${APP_BASE}/api/health`);
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status).toBe('ok');
  });

  test('dummy gateway is up and its control plane resets state', async ({ request }) => {
    const health = await request.get(`${DUMMY_BASE}/__health`);
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe('ok');

    const reset = await request.post(`${DUMMY_BASE}/__control/reset`);
    expect(reset.ok()).toBeTruthy();
  });

  test('dummy gateway captures a signed create and serves the checkout page', async ({ request }) => {
    await request.post(`${DUMMY_BASE}/__control/reset`);

    const unsignedCreate = {
      merchant_id: CONTRACT_SECRETS.plutu.merchantId,
      amount: '120',
      currency: 'LYD',
      order_id: 'ord_e2e_smoke_0001',
      customer_name: 'Smoke Tester',
      customer_email: 'smoke@example.ly',
      return_url: `${APP_BASE}/payment/return`,
      callback_url: `${APP_BASE}/api/external/gateways/plutu/webhook`,
    };
    const signature = plutuSign(unsignedCreate, CONTRACT_SECRETS.plutu.secretKey);

    const created = await request.post(`${DUMMY_BASE}/payment/create`, {
      data: { ...unsignedCreate, signature },
    });
    expect(created.ok()).toBeTruthy();
    const createdBody = await created.json();
    expect(createdBody.payment_url).toContain('/pay/');
    expect(createdBody.session_id).toBeTruthy();

    const page = await request.get(createdBody.payment_url);
    expect(page.ok()).toBeTruthy();
    const html = await page.text();
    expect(html).toContain('data-testid="dg-succeed"');
    expect(html).toContain('data-testid="dg-fail"');
    expect(html).toContain('ord_e2e_smoke_0001');

    const captured = await request.get(`${DUMMY_BASE}/__control/creates`);
    const { creates } = await captured.json();
    expect(creates).toHaveLength(1);
    expect(creates[0].orderId).toBe('ord_e2e_smoke_0001');
  });

  test('dummy gateway rejects a create request with a bad signature', async ({ request }) => {
    await request.post(`${DUMMY_BASE}/__control/reset`);
    const res = await request.post(`${DUMMY_BASE}/payment/create`, {
      data: { merchant_id: 'x', amount: '1', order_id: 'o', signature: 'deadbeef' },
    });
    expect(res.status()).toBe(401);
  });
});
