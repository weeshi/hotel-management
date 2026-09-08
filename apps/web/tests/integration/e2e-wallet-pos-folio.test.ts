import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_test';

describe('Phase 2 E2E: Wallet-POS-Folio Money Flow', () => {
  beforeAll(() => {
    // Ensure clean test DB
    execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS hotel_test WITH (FORCE);"`,
      { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
    );
    execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\createdb.exe" -U postgres -h localhost hotel_test`,
      { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
    );
    // Override env so Prisma singleton picks up the test DB
    process.env.DATABASE_URL = TEST_DB_URL;
    delete (globalThis as any).prisma;
    // Push schema
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    });
  });

  afterAll(() => {
    execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS hotel_test WITH (FORCE);"`,
      { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
    );
  });

  it('should complete full happy path — deposit → order → wallet-settle → audit', async () => {
    // Dynamic imports ensure PrismaClient reads the test DATABASE_URL
    const { WalletService } = await import('@/lib/services/wallet.service');
    const { RestaurantOrderService } = await import('@/lib/services/restaurant-order.service');
    const { FolioService } = await import('@/lib/services/folio.service');
    const { prisma } = await import('@/lib/utils/prisma');
    const { FolioRepository } = await import('@/lib/repositories/folio.repository');

    const walletService = new WalletService();
    const restaurantOrderService = new RestaurantOrderService();
    const folioService = new FolioService();

    // ── 1. Seed base data ────────────────────────────────────
    const hotel = await prisma.hotel.create({
      data: { name: 'E2E Test Hotel', currency: 'LYD' },
    });
    const admin = await prisma.user.create({
      data: {
        email: 'e2e.admin@test.com', password: 'hashed',
        name: 'E2E Admin', role: 'ADMIN', hotelId: hotel.id,
      },
    });
    const roomType = await prisma.roomType.create({
      data: { hotelId: hotel.id, name: 'Standard', baseRate: 200, capacity: 2 },
    });
    const room = await prisma.room.create({
      data: {
        hotelId: hotel.id, roomNumber: 'E2E-101',
        roomTypeId: roomType.id, status: 'AVAILABLE',
      },
    });

    await prisma.menuCategory.create({
      data: { hotelId: hotel.id, name: 'مشروبات', nameAr: 'مشروبات' },
    });

    // ── 2. Guest + Confirmed Booking ─────────────────────────
    const guest = await prisma.guest.create({
      data: { name: 'ضيف التجربة', email: 'e2e.guest@test.com', phone: '+218911111111', hotelId: hotel.id },
    });
    const booking = await prisma.booking.create({
      data: {
        bookingNo: 'BK-202607-E2E3', hotelId: hotel.id,
        guestId: guest.id, guestName: guest.name,
        adults: 1, children: 0, status: 'CONFIRMED',
        rooms: {
          create: {
            roomId: room.id, nightlyRate: 200,
            checkIn: new Date('2026-07-01T14:00:00Z'),
            checkOut: new Date('2026-07-03T12:00:00Z'),
          },
        },
      },
    });

    // ── 3. Check-in → Active Folio ───────────────────────────
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN' },
    });
    const folio = await prisma.folio.create({
      data: { bookingId: booking.id, totalCharges: 0, totalPaid: 0, balance: 0 },
    });

    // ── 4. Wallet Funding – 1 000 LYD ────────────────────────
    const depositTx = await walletService.deposit({
      guestId: guest.id, hotelId: hotel.id,
      amount: 1000, description: 'إيداع تجربة E2E',
      method: 'CASH', createdById: admin.id, userRole: 'ADMIN',
    });
    const wallet = await walletService.getWallet(guest.id, hotel.id);

    // ── 5. Restaurant Order – 150 LYD ────────────────────────
    const menuCategory = await prisma.menuCategory.findFirst({ where: { hotelId: hotel.id } })!;
    const menuItem = await prisma.menuItem.create({
      data: {
        hotelId: hotel.id, categoryId: menuCategory!.id,
        name: 'عصير برتقال', nameAr: 'عصير برتقال', price: 150,
      },
    });
    const order = await prisma.restaurantOrder.create({
      data: {
        hotelId: hotel.id, bookingId: booking.id,
        orderNo: 'ORD-E2E-0003', orderType: 'ROOM_SERVICE',
        roomNo: 'E2E-101', status: 'PENDING', totalAmount: 150,
        createdById: admin.id,
        items: { create: { menuItemId: menuItem.id, quantity: 1, price: 150 } },
      },
    });

    // ── 6. Settle via WALLET (actual service method) ─────────
    const settledOrder = await restaurantOrderService.settleOrder(order.id, {
      method: 'WALLET', userId: admin.id, userRole: 'ADMIN', hotelId: hotel.id,
    });

    // ── 7. Full Audit Query ──────────────────────────────────
    const [folioSummary, walletAfter, folioTransactions, walletTransactions, payments] =
      await Promise.all([
        folioService.getFolioSummary(folio.id, hotel.id),
        walletService.getWallet(guest.id, hotel.id),
        prisma.folioTransaction.findMany({
          where: { folioId: folio.id },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.walletTransaction.findMany({
          where: { walletId: wallet.id },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.payment.findMany({ where: { folioId: folio.id } }),
      ]);

    // =================== AUDIT REPORT ==========================
    console.log('\n' + '═'.repeat(72));
    console.log('  PHASE 2 E2E — FINANCIAL AUDIT REPORT');
    console.log('═'.repeat(72));

    console.log('\n─── FOLIO (الفاتورة) ───');
    console.log(`  ID:            ${folioSummary.folioId}`);
    console.log(`  Status:        ${folioSummary.status}`);
    console.log(`  Total Charges: ${folioSummary.totalCharges} LYD`);
    console.log(`  Total Paid:    ${folioSummary.totalPaid} LYD`);
    console.log(`  Balance:       ${folioSummary.balance} LYD`);

    console.log('\n─── WALLET (المحفظة) ───');
    console.log(`  ID:      ${walletAfter.id}`);
    console.log(`  Balance: ${Number(walletAfter.balance)} LYD`);
    console.log(`  Frozen:  ${walletAfter.isFrozen}`);

    console.log('\n─── FOLIO TRANSACTIONS (حركات الفاتورة) ───');
    for (const tx of folioTransactions) {
      const sign = tx.amount > 0 ? '+' : '';
      console.log(`  ${tx.type.padEnd(8)} | ${tx.description.padEnd(33)} | ${sign}${tx.amount} LYD`);
    }

    console.log('\n─── WALLET TRANSACTIONS (حركات المحفظة) ───');
    for (const tx of walletTransactions) {
      const sign = Number(tx.amount) > 0 ? '+' : '';
      console.log(
        `  ${tx.type.padEnd(10)} | ${Number(tx.balanceBefore).toString().padStart(6)} → ${Number(tx.balanceAfter).toString().padStart(6)} LYD  |  (${sign}${Number(tx.amount)} LYD)`,
      );
    }

    console.log('\n─── PAYMENT RECORDS (المدفوعات) ───');
    for (const p of payments) {
      console.log(`  method=${p.method.padEnd(8)}  amount=${p.amount} LYD  status=${p.status}`);
    }

    // ── VERIFICATION ───────────────────────────────────────────
    console.log('\n─── VERIFICATION ───\n');

    // Folio
    expect(folioSummary.totalCharges).toBe(150);
    console.log('  ✅ Folio totalCharges = 150 LYD');
    expect(folioSummary.totalPaid).toBe(150);
    console.log('  ✅ Folio totalPaid    = 150 LYD');
    expect(folioSummary.balance).toBe(0);
    console.log('  ✅ Folio balance      = 0 LYD (fully settled)');
    expect(folioSummary.status).toBe('SETTLED');
    console.log('  ✅ Folio status       = SETTLED (auto-settled)');

    // Wallet
    expect(Number(walletAfter.balance)).toBe(850);
    console.log('  ✅ Wallet balance     = 850 LYD (1 000 − 150)');

    // Wallet TX
    expect(walletTransactions).toHaveLength(2);
    expect(walletTransactions[0].type).toBe('DEPOSIT');
    expect(walletTransactions[1].type).toBe('WITHDRAWAL');
    console.log('  ✅ Wallet TX count    = 2 (DEPOSIT + WITHDRAWAL)');

    expect(Number(walletTransactions[0].amount)).toBe(1000);
    expect(Number(walletTransactions[0].balanceBefore)).toBe(0);
    expect(Number(walletTransactions[0].balanceAfter)).toBe(1000);
    console.log('  ✅ Wallet DEPOSIT     : 0 → 1 000 LYD');

    expect(Number(walletTransactions[1].amount)).toBe(-150);
    expect(Number(walletTransactions[1].balanceBefore)).toBe(1000);
    expect(Number(walletTransactions[1].balanceAfter)).toBe(850);
    console.log('  ✅ Wallet WITHDRAWAL  : 1 000 → 850 LYD');

    // Folio TX
    expect(folioTransactions).toHaveLength(2);
    console.log('  ✅ Folio TX count     = 2 (CHARGE + PAYMENT)');
    expect(folioTransactions[0].type).toBe('CHARGE');
    expect(folioTransactions[0].amount).toBe(150);
    console.log('  ✅ Folio CHARGE       : +150 LYD');
    expect(folioTransactions[1].type).toBe('PAYMENT');
    expect(folioTransactions[1].amount).toBe(-150);
    console.log('  ✅ Folio PAYMENT      : -150 LYD');

    // Payment
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe('WALLET');
    expect(payments[0].amount).toBe(150);
    expect(payments[0].status).toBe('SUCCEEDED');
    console.log('  ✅ Payment record     : WALLET 150 LYD SUCCEEDED');

    // Order
    expect(settledOrder.status).toBe('PAID');
    console.log('  ✅ Order status       : PAID');

    // Ledger continuity
    expect(Number(walletTransactions[1].balanceAfter)).toBe(850);
    expect(Number(walletAfter.balance)).toBe(850);
    console.log('  ✅ Ledger continuity  : walletAfter === 850 ✓');
    expect(Number(folioSummary.balance)).toBe(0);
    expect(Number(folioSummary.totalPaid)).toBe(Number(folioSummary.totalCharges));
    console.log('  ✅ Ledger continuity  : folio paid === folio charged, balance = 0 ✓');

    console.log('\n' + '═'.repeat(72));
    console.log('  ✅ ALL CHECKS PASSED — PHASE 2 MONEY FLOW VALIDATED');
    console.log('═'.repeat(72) + '\n');
  });
});
