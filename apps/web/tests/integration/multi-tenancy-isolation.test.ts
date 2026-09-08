import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { BookingService } from '@/lib/services/booking.service';
import { GuestService } from '@/lib/services/guest.service';
import { GuestDocumentService } from '@/lib/services/guest-document.service';
import { FolioService } from '@/lib/services/folio.service';
import { NotFoundError } from '@/lib/utils/errors';

const bookingService = new BookingService();
const guestService = new GuestService();
const documentService = new GuestDocumentService();
const folioService = new FolioService();

let data: Awaited<ReturnType<typeof seedTestData>>;
let hotelB: { id: string };
let guestA: { id: string };
let guestB: { id: string };
let bookingA: { id: string };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();

  // --- Hotel B (a competing tenant) ---
  hotelB = await prisma.hotel.create({
    data: { id: 'tenant-b-hotel', name: 'Tenant B Hotel', currency: 'LYD' },
  });
  const adminB = await prisma.user.create({
    data: {
      email: 'admin@tenanthotel.com',
      password: await (await import('bcryptjs')).hash('TestPass123', 4),
      name: 'Admin B',
      role: 'ADMIN',
      hotelId: hotelB.id,
    },
  });

  // One guest per tenant
  guestA = await prisma.guest.create({ data: { name: 'ضيف أ', hotelId: data.hotel.id } });
  guestB = await prisma.guest.create({ data: { name: 'ضيف ب', hotelId: hotelB.id } });

  // A checked-in booking in Hotel A (creates a folio) so we can probe cross-tenant access
  bookingA = await bookingService.create({
    hotelId: data.hotel.id,
    guestName: 'ضيف حجز أ',
    adults: 1,
    children: 0,
    checkIn: todayPlus(0),
    checkOut: todayPlus(1),
    source: 'RECEPTION',
    rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
  });
  await bookingService.confirm(bookingA.id, data.hotel.id);
  await bookingService.checkIn(bookingA.id, data.hotel.id);
});

afterAll(async () => {
  await closeDb();
});

describe('Multi-tenancy isolation (Hotel A vs Hotel B)', () => {
  it('allows reading a guest in the SAME hotel', async () => {
    const found = await guestService.getById(guestA.id, data.hotel.id);
    expect(found.name).toBe('ضيف أ');
  });

  it('blocks reading a guest by its own id from ANOTHER hotel', async () => {
    await expect(guestService.getById(guestA.id, hotelB.id)).rejects.toThrow(NotFoundError);
    await expect(guestService.getById(guestB.id, data.hotel.id)).rejects.toThrow(NotFoundError);
  });

  it('blocks confirming a booking with ANOTHER hotel id', async () => {
    await expect(bookingService.confirm(bookingA.id, hotelB.id)).rejects.toThrow('الحجز غير موجود');
  });

  it('blocks reading a folio with ANOTHER hotel id', async () => {
    const folio = await prisma.folio.findUnique({ where: { bookingId: bookingA.id } });
    expect(folio).toBeDefined();
    await expect(folioService.getFolioSummary(folio!.id, hotelB.id)).rejects.toThrow(NotFoundError);
    await expect(folioService.getFolioSummary(folio!.id, data.hotel.id)).resolves.toBeDefined();
  });

  it('blocks listing documents of a guest from ANOTHER hotel', async () => {
    await expect(documentService.listDocuments(guestA.id, hotelB.id)).rejects.toThrow(NotFoundError);
  });

  it('blocks uploading a document for a guest from ANOTHER hotel', async () => {
    await expect(
      documentService.uploadDocument({
        guestId: guestA.id,
        hotelId: hotelB.id,
        uploadedById: data.admin.id,
        documentType: 'PASSPORT',
        file: { name: 'x.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('allows document operations for a guest in the SAME hotel', async () => {
    await expect(documentService.listDocuments(guestA.id, data.hotel.id)).resolves.toEqual([]);
  });

  it('guest unique fields are scoped per hotel (same email allowed across tenants)', async () => {
    const email = 'shared@example.com';
    await prisma.guest.create({ data: { name: 'نزيل أ', email, hotelId: data.hotel.id } });
    const second = await prisma.guest.create({ data: { name: 'نزيل ب', email, hotelId: hotelB.id } });
    expect(second.id).toBeDefined();
  });
});
