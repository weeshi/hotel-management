import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { APP_BASE, DUMMY_BASE } from './setup/env';
import { createE2eClient } from './setup/db';
import { seedGuestBooking, SeededBookingContext } from './setup/seed-guest-payment';

// E2E.2 — Guest Payment Journey (Plutu) against the E2E dummy gateway.
// E2E.3 — The remaining targeted scenarios (§6 of E2E-TESTING-ARCH.md): T-Lync
// success, payment failure, return-before-webhook (the real M6 loop), duplicate
// webhook idempotency, and rejected create.
//
// The app runs in production mode (NODE_ENV=production via `next start`), but the
// guest checkout is unauthenticated — no session cookies are involved, so the
// Secure-cookie paradox of E2E.1.6 does not apply here. Assertions on the ledger
// are read back through Prisma against the live E2E database.

const prisma = createE2eClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

type GatewayName = 'plutu' | 'tlync';

async function startToPayPage(
  page: Page,
  ctx: SeededBookingContext,
  gateway: GatewayName,
): Promise<void> {
  await page.goto(`${APP_BASE}/booking/${ctx.bookingId}/checkout`);
  await page.getByTestId(`gateway-card-${gateway}`).click();

  const redirectButton = page.getByTestId('checkout-redirect-gateway');
  await expect(redirectButton).toBeVisible();
  await redirectButton.click();

  // Guest lands on the Dummy Gateway checkout page.
  await page.waitForURL(`**/pay/**`);
  await expect(page.getByTestId('dg-succeed')).toBeVisible();
}

async function resolveDummyCreate(
  request: APIRequestContext,
  bookingId: string,
): Promise<{ sessionId: string }> {
  const createsRes = await request.get(`${DUMMY_BASE}/__control/creates`);
  expect(createsRes.ok()).toBeTruthy();
  const { creates } = await createsRes.json();
  const create = creates.find(
    (c: { orderId: string; sessionId: string }) =>
      c.orderId.startsWith(`pay_${bookingId}_`),
  );
  expect(create).toBeTruthy();
  return create as { sessionId: string };
}

test.describe('E2E.2 Guest Payment Journey — Plutu via Dummy Gateway', () => {
  const AMOUNT = 250;

  test.beforeEach(async ({ request }) => {
    const reset = await request.post(`${DUMMY_BASE}/__control/reset`);
    expect(reset.ok()).toBeTruthy();
  });

  test('happy path: guest pays via Plutu and the folio settles to zero', async ({
    page,
  }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT });

    await page.goto(`${APP_BASE}/booking/${ctx.bookingId}/checkout`);

    const plutuCard = page.getByTestId('gateway-card-plutu');
    await expect(plutuCard).toBeVisible();
    await plutuCard.click();

    // App creates the payment session (DB-sourced Plutu config, dummy baseUrl)
    // and shows the redirecting step.
    const redirectButton = page.getByTestId('checkout-redirect-gateway');
    await expect(redirectButton).toBeVisible();
    await redirectButton.click();

    // Guest lands on the Dummy Gateway checkout page.
    await page.waitForURL(`**/pay/**`);
    await expect(page.getByTestId('dg-succeed')).toBeVisible();

    // Guest pays successfully → dummy signs + delivers the SUCCESS webhook to
    // the app's callback, then redirects the browser to ?step=success.
    await page.getByTestId('dg-succeed').click();

    await page.waitForURL(`**/booking/${ctx.bookingId}/checkout**`);
    await expect(page.getByTestId('checkout-success')).toBeVisible();

    // Ledger: folio fully settled.
    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(0);
    expect(Number(folio!.totalPaid)).toBe(AMOUNT);
    expect(folio!.status).toBe('SETTLED');
    expect(folio!.settledAt).not.toBeNull();

    // Session promoted to SUCCEEDED and linked to the Payment row.
    const session = await prisma.paymentSession.findFirst({
      where: { bookingId: ctx.bookingId },
    });
    expect(session).not.toBeNull();
    expect(session!.status).toBe('SUCCEEDED');
    expect(session!.paymentId).not.toBeNull();

    const payment = await prisma.payment.findFirst({ where: { bookingId: ctx.bookingId } });
    expect(payment).not.toBeNull();
    expect(Number(payment!.amount)).toBe(AMOUNT);
    expect(payment!.method).toBe('PLUTU');
    expect(payment!.status).toBe('SUCCEEDED');

    const folioTx = await prisma.folioTransaction.findFirst({
      where: { folioId: folio!.id, type: 'PAYMENT' },
    });
    expect(folioTx).not.toBeNull();
    expect(Number(folioTx!.amount)).toBe(-AMOUNT);

    const webhook = await prisma.gatewayWebhook.findFirst({
      where: { hotelId: ctx.hotelId },
    });
    expect(webhook).not.toBeNull();
    expect(webhook!.status).toBe('PROCESSED');
    expect(webhook!.paymentId).toBe(payment!.id);
    expect(webhook!.paymentSessionId).toBe(session!.id);
  });

  test('forged webhook is rejected and the booking ledger is untouched', async ({
    page,
    request,
  }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT });

    await page.goto(`${APP_BASE}/booking/${ctx.bookingId}/checkout`);
    await page.getByTestId('gateway-card-plutu').click();

    const redirectButton = page.getByTestId('checkout-redirect-gateway');
    await expect(redirectButton).toBeVisible();
    await redirectButton.click();

    // Guest is on the Dummy Gateway checkout (app session is PENDING).
    await page.waitForURL(`**/pay/**`);
    await expect(page.getByTestId('dg-succeed')).toBeVisible();

    // Resolve the dummy create record for this booking (order_id = pay_{bookingId}_...).
    const createsRes = await request.get(`${DUMMY_BASE}/__control/creates`);
    expect(createsRes.ok()).toBeTruthy();
    const { creates } = await createsRes.json();
    const create = creates.find(
      (c: { orderId: string; sessionId: string }) =>
        c.orderId.startsWith(`pay_${ctx.bookingId}_`),
    );
    expect(create).toBeTruthy();

    // Control plane forces a forged webhook (signature mismatched on purpose).
    const forge = await request.post(`${DUMMY_BASE}/__control/forge`, {
      data: { sessionId: create.sessionId },
    });
    expect(forge.ok()).toBeTruthy();
    const forgeBody = await forge.json();
    expect(forgeBody.statusCode).toBe(401);

    // Ledger: nothing moved, session untouched, no artifacts recorded.
    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(AMOUNT);
    expect(Number(folio!.totalPaid)).toBe(0);
    expect(folio!.status).toBe('ACTIVE');

    const session = await prisma.paymentSession.findFirst({
      where: { bookingId: ctx.bookingId },
    });
    expect(session).not.toBeNull();
    expect(session!.status).toBe('PENDING');

    expect(await prisma.payment.count({ where: { bookingId: ctx.bookingId } })).toBe(0);
    expect(await prisma.gatewayWebhook.count({ where: { hotelId: ctx.hotelId } })).toBe(0);
    expect(
      await prisma.folioTransaction.count({
        where: { folioId: folio!.id, type: 'PAYMENT' },
      }),
    ).toBe(0);

    // Guest returns without paying → the app must NOT show success; it shows the
    // unconfirmed state (verified even after the poller exhausts its attempts).
    await page.getByTestId('dg-cancel').click();
    await page.waitForURL(`**/booking/${ctx.bookingId}/checkout**`);
    const unverified = page.getByTestId('checkout-unverified');
    await expect(unverified).toBeVisible();
    await expect(unverified).toContainText('تعذر تأكيد حالة الدفع', { timeout: 30_000 });
  });
});

// ---------------------------------------------------------------------------
// E2E.3 — Guest Payment Journey: the remaining §6 targeted scenarios.
// ---------------------------------------------------------------------------

test.describe('E2E.3 Guest Payment Journey — remaining scenarios via Dummy Gateway', () => {
  const AMOUNT = 250;

  test.beforeEach(async ({ request }) => {
    const reset = await request.post(`${DUMMY_BASE}/__control/reset`);
    expect(reset.ok()).toBeTruthy();
  });

  test('happy path via T-Lync: folio settles to zero', async ({ page }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT, gateway: 'tlync' });

    // Fresh T-Lync checkout: card → redirect → landing on the dummy pay page.
    await startToPayPage(page, ctx, 'tlync');

    await page.getByTestId('dg-succeed').click();
    await page.waitForURL(`**/booking/${ctx.bookingId}/checkout**`);
    await expect(page.getByTestId('checkout-success')).toBeVisible();

    // Ledger: folio fully settled by a single T-Lync payment.
    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(0);
    expect(Number(folio!.totalPaid)).toBe(AMOUNT);
    expect(folio!.status).toBe('SETTLED');
    expect(folio!.settledAt).not.toBeNull();

    const session = await prisma.paymentSession.findFirst({
      where: { bookingId: ctx.bookingId },
    });
    expect(session).not.toBeNull();
    expect(session!.status).toBe('SUCCEEDED');
    expect(session!.paymentId).not.toBeNull();

    const payment = await prisma.payment.findFirst({ where: { bookingId: ctx.bookingId } });
    expect(payment).not.toBeNull();
    expect(Number(payment!.amount)).toBe(AMOUNT);
    expect(payment!.method).toBe('TLYNC');
    expect(payment!.gateway).toBe('tlync');
    expect(payment!.status).toBe('SUCCEEDED');

    const webhook = await prisma.gatewayWebhook.findFirst({
      where: { hotelId: ctx.hotelId },
    });
    expect(webhook).not.toBeNull();
    expect(webhook!.type).toBe('payment.success');
    expect(webhook!.status).toBe('PROCESSED');
    expect(webhook!.paymentId).toBe(payment!.id);
    expect(webhook!.paymentSessionId).toBe(session!.id);
  });

  test('payment failure: FAILED webhook, unconfirmed screen, ledger untouched', async ({
    page,
  }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT });

    await startToPayPage(page, ctx, 'plutu');

    // Guest's payment fails → dummy delivers a FAILED webhook and redirects back.
    // Unlike the "cancel" path the FAILED webhook is delivered before the browser
    // returns, so the session is already FAILED when ?step=success renders.
    await page.getByTestId('dg-fail').click();
    await page.waitForURL(`**/booking/${ctx.bookingId}/checkout**`);

    // The app must NOT show success — it shows the unconfirmed state (the poller
    // keeps polling a FAILED session, exhausts its attempts, and settles on it).
    const unverified = page.getByTestId('checkout-unverified');
    await expect(unverified).toBeVisible();
    await expect(unverified).toContainText('تعذر تأكيد حالة الدفع', { timeout: 30_000 });

    // Ledger: nothing moved; the FAILED webhook was recorded and processed.
    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(AMOUNT);
    expect(Number(folio!.totalPaid)).toBe(0);
    expect(folio!.status).toBe('ACTIVE');

    const session = await prisma.paymentSession.findFirst({
      where: { bookingId: ctx.bookingId },
    });
    expect(session).not.toBeNull();
    expect(session!.status).toBe('FAILED');

    expect(await prisma.payment.count({ where: { bookingId: ctx.bookingId } })).toBe(0);
    expect(
      await prisma.folioTransaction.count({
        where: { folioId: folio!.id, type: 'PAYMENT' },
      }),
    ).toBe(0);

    const webhooks = await prisma.gatewayWebhook.findMany({
      where: { hotelId: ctx.hotelId },
    });
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].type).toBe('payment.failed');
    expect(webhooks[0].status).toBe('PROCESSED');
    expect(webhooks[0].paymentSessionId).toBe(session!.id);
  });

  test('return before the webhook, then the gateway settles: the M6 loop flips to success', async ({
    page,
    request,
  }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT });

    await startToPayPage(page, ctx, 'plutu');

    // Guest returns without paying → NO webhook yet; the session stays PENDING
    // and the guest lands on the verifying screen (M6 loop) still polling.
    await page.getByTestId('dg-cancel').click();
    await page.waitForURL(`**/booking/${ctx.bookingId}/checkout**`);

    const unverified = page.getByTestId('checkout-unverified');
    await expect(unverified).toBeVisible();
    await expect(unverified).toContainText('في انتظار تأكيد الدفع');

    // The gateway settles the payment out-of-band → SUCCESS webhook arrives.
    const create = await resolveDummyCreate(request, ctx.bookingId);
    const settle = await request.post(`${DUMMY_BASE}/__control/settle`, {
      data: { sessionId: create.sessionId, status: 'SUCCESS' },
    });
    expect(settle.ok()).toBeTruthy();

    // The poller picks the SUCCEEDED session up and router.refresh() swaps the
    // verifying screen for the real success view.
    await expect(page.getByTestId('checkout-success')).toBeVisible({ timeout: 30_000 });

    // Ledger: settled exactly once.
    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(0);
    expect(Number(folio!.totalPaid)).toBe(AMOUNT);
    expect(folio!.status).toBe('SETTLED');

    expect(await prisma.payment.count({ where: { bookingId: ctx.bookingId } })).toBe(1);
    const session = await prisma.paymentSession.findFirst({
      where: { bookingId: ctx.bookingId },
    });
    expect(session!.status).toBe('SUCCEEDED');
  });

  test('duplicate webhook settles exactly once', async ({ page, request }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT });

    await startToPayPage(page, ctx, 'plutu');
    const create = await resolveDummyCreate(request, ctx.bookingId);

    // Control plane delivers the same webhook twice back-to-back.
    const dup = await request.post(`${DUMMY_BASE}/__control/duplicate`, {
      data: { sessionId: create.sessionId, status: 'SUCCESS' },
    });
    expect(dup.ok()).toBeTruthy();
    const dupBody = await dup.json();
    expect(dupBody.first.statusCode).toBe(200);
    expect(dupBody.second.statusCode).toBe(200);

    // The app dedupes on (provider, hotelId, eventId): one webhook row kept.
    const webhooks = await prisma.gatewayWebhook.findMany({
      where: { hotelId: ctx.hotelId },
    });
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].status).toBe('PROCESSED');

    // Exactly one payment, one folio movement, one settlement.
    const payments = await prisma.payment.findMany({
      where: { bookingId: ctx.bookingId },
    });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(AMOUNT);

    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(0);
    expect(Number(folio!.totalPaid)).toBe(AMOUNT);
    expect(folio!.status).toBe('SETTLED');

    const folioTxs = await prisma.folioTransaction.findMany({
      where: { folioId: folio!.id, type: 'PAYMENT' },
    });
    expect(folioTxs).toHaveLength(1);
    expect(Number(folioTxs[0].amount)).toBe(-AMOUNT);

    const session = await prisma.paymentSession.findFirst({
      where: { bookingId: ctx.bookingId },
    });
    expect(session!.status).toBe('SUCCEEDED');
    expect(session!.paymentId).toBe(payments[0].id);
  });

  test('rejected create: clear failure screen, no leftover payment session', async ({
    page,
    request,
  }) => {
    const ctx = await seedGuestBooking(prisma, { amount: AMOUNT });

    // Arm the dummy to reject Plutu create requests before the guest checks out.
    const arm = await request.post(`${DUMMY_BASE}/__control/fail-create`, {
      data: { provider: 'plutu' },
    });
    expect(arm.ok()).toBeTruthy();

    await page.goto(`${APP_BASE}/booking/${ctx.bookingId}/checkout`);
    await page.getByTestId('gateway-card-plutu').click();

    // The app shows the failure view with the gateway's rejection surfaced.
    const failure = page.getByRole('region', { name: 'فشل الدفع' });
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('فشل إتمام الدفع');
    await expect(failure.getByRole('alert')).toContainText('فشل إنشاء جلسة الدفع');

    // No PaymentSession row is left behind (the row is only created after the
    // gateway create succeeds), and the ledger is untouched.
    expect(await prisma.paymentSession.count({ where: { bookingId: ctx.bookingId } })).toBe(0);
    const folio = await prisma.folio.findUnique({ where: { bookingId: ctx.bookingId } });
    expect(folio).not.toBeNull();
    expect(Number(folio!.balance)).toBe(AMOUNT);
    expect(Number(folio!.totalPaid)).toBe(0);
    expect(folio!.status).toBe('ACTIVE');
  });
});