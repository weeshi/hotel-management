import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import { prisma as appPrisma } from '@/lib/utils/prisma';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_test';

let initialized = false;

function ensureTestDb() {
  if (initialized) return;
  initialized = true;

  execSync(
    `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS hotel_test WITH (FORCE);"`,
    { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
  );
  execSync(
    `"C:\\Program Files\\PostgreSQL\\18\\bin\\createdb.exe" -U postgres -h localhost hotel_test`,
    { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
  );

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
}

function createTestClient() {
  ensureTestDb();
  return new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
}

const globalForTest = globalThis as { testPrisma?: PrismaClient };
const rawClient = globalForTest.testPrisma ?? createTestClient();
if (process.env.NODE_ENV !== 'production') {
  globalForTest.testPrisma = rawClient;
}

/**
 * The tenancy-aware application client. Tests should use THIS for fixtures and
 * assertions so the same `hotelId` injection + `tenantTx` semantics that run in
 * production are exercised here (the ambient tenant context is installed by
 * `tests/setup.ts`). Bulk teardown that must span tenants uses {@link prismaRaw}.
 */
export const prisma = appPrisma;

/** Superuser/BYPASSRLS client reserved for cross-tenant teardown and seeding. */
export const prismaRaw = rawClient;

export async function resetDb() {
  await prismaRaw.$transaction([
    prismaRaw.vCCAuditLog.deleteMany(),
    prismaRaw.auditLog.deleteMany(),
    prismaRaw.notification.deleteMany(),
    prismaRaw.invitation.deleteMany(),
    prismaRaw.guestDocument.deleteMany(),
    prismaRaw.housekeepingTask.deleteMany(),
    prismaRaw.refreshToken.deleteMany(),
    prismaRaw.apiKey.deleteMany(),
    prismaRaw.channelPriceSnapshot.deleteMany(),
    prismaRaw.channelMapping.deleteMany(),
    prismaRaw.bookingService.deleteMany(),
    prismaRaw.folioRoutingRule.deleteMany(),
    prismaRaw.folioTransaction.deleteMany(),
    prismaRaw.folioDiscount.deleteMany(),
    prismaRaw.scheduledCharge.deleteMany(),
    prismaRaw.invoice.deleteMany(),
    prismaRaw.payment.deleteMany(),
    prismaRaw.gatewayWebhook.deleteMany(),
    prismaRaw.paymentSession.deleteMany(),
    prismaRaw.integrationConfig.deleteMany(),
    prismaRaw.groupBooking.deleteMany(),
    prismaRaw.folio.deleteMany(),
    prismaRaw.bookingRoom.deleteMany(),
    prismaRaw.booking.deleteMany(),
    prismaRaw.service.deleteMany(),
    prismaRaw.serviceCategory.deleteMany(),
    prismaRaw.cancellationPolicy.deleteMany(),
    prismaRaw.room.deleteMany(),
    prismaRaw.roomType.deleteMany(),
    prismaRaw.wallet.deleteMany(),
    prismaRaw.walletTransaction.deleteMany(),
    prismaRaw.guest.deleteMany(),
    prismaRaw.restaurantOrder.deleteMany(),
    prismaRaw.menuItem.deleteMany(),
    prismaRaw.menuCategory.deleteMany(),
    prismaRaw.externalClient.deleteMany(),
    prismaRaw.user.deleteMany(),
    prismaRaw.hotel.deleteMany(),
  ]);
}

export async function seedTestData() {
  const bcrypt = await import('bcryptjs');
  const password = await bcrypt.hash('TestPass123', 4);

  const hotel = await prismaRaw.hotel.create({
    data: {
      id: 'test-hotel',
      name: 'Test Hotel',
      currency: 'LYD',
    },
  });

  const admin = await prismaRaw.user.create({
    data: {
      email: 'test@hotel.com',
      password,
      name: 'Test Admin',
      role: 'ADMIN',
      hotelId: hotel.id,
    },
  });

  const receptionist = await prismaRaw.user.create({
    data: {
      email: 'reception@test.com',
      password,
      name: 'Test Reception',
      role: 'RECEPTION',
      hotelId: hotel.id,
    },
  });

  const singleType = await prismaRaw.roomType.create({
    data: {
      id: 'test-single',
      hotelId: hotel.id,
      name: 'Single',
      baseRate: 200,
      capacity: 1,
    },
  });

  const doubleType = await prismaRaw.roomType.create({
    data: {
      id: 'test-double',
      hotelId: hotel.id,
      name: 'Double',
      baseRate: 300,
      capacity: 2,
    },
  });

  const room101 = await prismaRaw.room.create({
    data: {
      hotelId: hotel.id,
      roomNumber: '101',
      floor: 1,
      roomTypeId: singleType.id,
      status: 'AVAILABLE',
    },
  });

  const room102 = await prismaRaw.room.create({
    data: {
      hotelId: hotel.id,
      roomNumber: '102',
      floor: 1,
      roomTypeId: doubleType.id,
      status: 'AVAILABLE',
    },
  });

  await prismaRaw.cancellationPolicy.create({
    data: {
      hotelId: hotel.id,
      name: 'Flexible',
      rules: JSON.stringify([
        { cancelBeforeHours: 24, refundPercentage: 100 },
        { cancelBeforeHours: 0, refundPercentage: 0 },
      ]),
    },
  });

  return { hotel, admin, receptionist, singleType, doubleType, room101, room102 };
}

export async function closeDb() {
  await prismaRaw.$disconnect();
  await appPrisma.$disconnect();
}
