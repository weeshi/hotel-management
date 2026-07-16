import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TEST_DB_URL = 'file:./test.db';

let initialized = false;

function ensureTestDb() {
  if (initialized) return;
  initialized = true;

  const dbPath = path.resolve(__dirname, '../../prisma/test.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  execSync('npx prisma db push --skip-generate', {
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
export const prisma = globalForTest.testPrisma ?? createTestClient();
if (process.env.NODE_ENV !== 'production') {
  globalForTest.testPrisma = prisma;
}

export async function resetDb() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.housekeepingTask.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.bookingService.deleteMany(),
    prisma.folioTransaction.deleteMany(),
    prisma.folioDiscount.deleteMany(),
    prisma.scheduledCharge.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.folio.deleteMany(),
    prisma.bookingRoom.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.service.deleteMany(),
    prisma.serviceCategory.deleteMany(),
    prisma.cancellationPolicy.deleteMany(),
    prisma.room.deleteMany(),
    prisma.roomType.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hotel.deleteMany(),
  ]);
}

export async function seedTestData() {
  const bcrypt = await import('bcryptjs');
  const password = await bcrypt.hash('TestPass123', 4);

  const hotel = await prisma.hotel.create({
    data: {
      id: 'test-hotel',
      name: 'Test Hotel',
      currency: 'LYD',
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'test@hotel.com',
      password,
      name: 'Test Admin',
      role: 'ADMIN',
      hotelId: hotel.id,
    },
  });

  const receptionist = await prisma.user.create({
    data: {
      email: 'reception@test.com',
      password,
      name: 'Test Reception',
      role: 'RECEPTION',
      hotelId: hotel.id,
    },
  });

  const singleType = await prisma.roomType.create({
    data: {
      id: 'test-single',
      hotelId: hotel.id,
      name: 'Single',
      baseRate: 200,
      capacity: 1,
    },
  });

  const doubleType = await prisma.roomType.create({
    data: {
      id: 'test-double',
      hotelId: hotel.id,
      name: 'Double',
      baseRate: 300,
      capacity: 2,
    },
  });

  const room101 = await prisma.room.create({
    data: {
      hotelId: hotel.id,
      roomNumber: '101',
      floor: 1,
      roomTypeId: singleType.id,
      status: 'AVAILABLE',
    },
  });

  const room102 = await prisma.room.create({
    data: {
      hotelId: hotel.id,
      roomNumber: '102',
      floor: 1,
      roomTypeId: doubleType.id,
      status: 'AVAILABLE',
    },
  });

  await prisma.cancellationPolicy.create({
    data: {
      hotelId: hotel.id,
      name: 'Flexible',
      rules: JSON.stringify([
        { hoursBefore: 24, refundPercent: 100 },
        { hoursBefore: 0, refundPercent: 0 },
      ]),
    },
  });

  return { hotel, admin, receptionist, singleType, doubleType, room101, room102 };
}

export async function closeDb() {
  await prisma.$disconnect();
}
