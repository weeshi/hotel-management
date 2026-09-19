import { test, expect } from '@playwright/test';
import { APP_BASE, DUMMY_BASE } from './setup/env';
import { createE2eClient } from './setup/db';
import { seedGuestBooking, SeededBookingContext } from './setup/seed-guest-payment';

// E2E.2 — Guest Payment Journey (Plutu) against the E2E dummy gateway.
//
// The app runs in production mode (NODE_ENV=production via `next start`), but the
// guest checkout is unauthenticated — no session cookies are involved, so the
// Secure-cookie paradox of E2E.1.6 does not apply here. Assertions on the ledger
// are read back through Prisma against the live E2E database.

const prisma = createE2eClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

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