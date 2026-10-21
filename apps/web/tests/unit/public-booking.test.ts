/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeDomain, getEffectiveHost, resolveTenantFromRequest } from '@/lib/utils/tenant';
import { PricingService } from '@/lib/services/pricing.service';
import { BookingService } from '@/lib/services/booking.service';

vi.mock('@/lib/utils/prisma', () => {
  const prisma = {
    $transaction: vi.fn(),
    hotel: {
      findUnique: vi.fn(),
    },
    room: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    roomType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    ratePlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    bookingRoom: {
      findFirst: vi.fn(),
    },
    cancellationPolicy: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    booking: {
      create: vi.fn(),
      update: vi.fn(),
    },
    folio: {
      create: vi.fn(),
      update: vi.fn(),
    },
    folioTransaction: {
      create: vi.fn(),
    },
    bookingService: {
      create: vi.fn(),
    },
    guest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return {
    prisma,
    prismaBase: prisma,
    prismaPlatform: {
      hotel: { findUnique: vi.fn(), findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    tenantTx: vi.fn(async (cb: (tx: unknown) => unknown) => prisma.$transaction(cb)),
  };
});

import { prisma, prismaPlatform } from '@/lib/utils/prisma';

describe('Tenant Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeDomain', () => {
    it('normalizes a standard domain', () => {
      expect(normalizeDomain('  Example.COM  ')).toBe('example.com');
    });

    it('strips protocol', () => {
      expect(normalizeDomain('https://hotel.example.com')).toBe('hotel.example.com');
      expect(normalizeDomain('http://hotel.example.com')).toBe('hotel.example.com');
    });

    it('strips path and query', () => {
      expect(normalizeDomain('hotel.example.com/path?query=1')).toBe('hotel.example.com');
    });

    it('strips port', () => {
      expect(normalizeDomain('hotel.example.com:3000')).toBe('hotel.example.com');
    });

    it('strips trailing dot', () => {
      expect(normalizeDomain('hotel.example.com.')).toBe('hotel.example.com');
    });

    it('returns null for empty/undefined', () => {
      expect(normalizeDomain('')).toBeNull();
      expect(normalizeDomain(undefined)).toBeNull();
      expect(normalizeDomain(null)).toBeNull();
    });
  });

  describe('getEffectiveHost', () => {
    it('uses host header when not proxied', () => {
      const req = new Request('https://example.com/path', {
        headers: { host: 'myhotel.example.com' },
      });
      expect(getEffectiveHost(req)).toBe('myhotel.example.com');
    });

    it('uses x-forwarded-host when proxied via Cloudflare', () => {
      const req = new Request('https://example.com/path', {
        headers: { host: 'fallback.com', 'cf-ray': '123', 'x-forwarded-host': 'realhotel.example.com' },
      });
      expect(getEffectiveHost(req)).toBe('realhotel.example.com');
    });

    it('uses x-forwarded-host when TRUST_PROXY=true', () => {
      process.env.TRUST_PROXY = 'true';
      try {
        const req = new Request('https://example.com/path', {
          headers: { host: 'fallback.com', 'x-forwarded-host': 'trustedhotel.example.com' },
        });
        expect(getEffectiveHost(req)).toBe('trustedhotel.example.com');
      } finally {
        delete process.env.TRUST_PROXY;
      }
    });

    it('ignores x-forwarded-host when not proxied and TRUST_PROXY=false', () => {
      const req = new Request('https://example.com/path', {
        headers: { host: 'realhotel.example.com', 'x-forwarded-host': 'spoofed.com' },
      });
      expect(getEffectiveHost(req)).toBe('realhotel.example.com');
    });
  });

  describe('resolveTenantFromRequest', () => {
    it('returns hotel when customDomain matches', async () => {
      (prismaPlatform.hotel.findUnique as vi.Mock).mockResolvedValue({ id: 'hotel-1', name: 'Test Hotel' });

      const req = new Request('https://myhotel.example.com', {
        headers: { host: 'myhotel.example.com' },
      });

      const result = await resolveTenantFromRequest(req);
      expect(result).toEqual({ id: 'hotel-1', name: 'Test Hotel' });
      expect(prismaPlatform.hotel.findUnique).toHaveBeenCalledWith({
        where: { customDomain: 'myhotel.example.com' },
        select: { id: true, name: true },
      });
    });

    it('returns null when customDomain not found', async () => {
      (prismaPlatform.hotel.findUnique as vi.Mock).mockResolvedValue(null);

      const req = new Request('https://unknown.example.com', {
        headers: { host: 'unknown.example.com' },
      });

      const result = await resolveTenantFromRequest(req);
      expect(result).toBeNull();
    });
  });
});

describe('PricingService - Availability', () => {
  let pricingService: PricingService;

  beforeEach(() => {
    vi.clearAllMocks();
    pricingService = new PricingService();
  });

  describe('checkAvailability', () => {
    it('returns false when room not found', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue(null);

      const result = await pricingService.checkAvailability('hotel-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toBe(false);
    });

    it('returns false when room status is OCCUPIED', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', status: 'OCCUPIED' });

      const result = await pricingService.checkAvailability('hotel-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toBe(false);
    });

    it('returns false when room status is MAINTENANCE', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', status: 'MAINTENANCE' });

      const result = await pricingService.checkAvailability('hotel-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toBe(false);
    });

    it('returns false when conflicting booking exists', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', status: 'AVAILABLE' });
      (prisma.bookingRoom.findFirst as vi.Mock).mockResolvedValue({ id: 'booking-room-1' });

      const result = await pricingService.checkAvailability('hotel-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toBe(false);
    });

    it('returns true when room is available and no conflicts', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', status: 'AVAILABLE' });
      (prisma.bookingRoom.findFirst as vi.Mock).mockResolvedValue(null);

      const result = await pricingService.checkAvailability('hotel-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toBe(true);
    });

    it('returns false for invalid date range (checkIn >= checkOut)', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', status: 'AVAILABLE' });

      const result = await pricingService.checkAvailability('hotel-1', 'room-1', new Date('2026-08-18'), new Date('2026-08-15'));
      expect(result).toBe(false);
    });
  });

  describe('findBestRatePlan', () => {
    it('returns null when no active rate plans', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', roomTypeId: 'rt-1' });
      (prisma.ratePlan.findMany as vi.Mock).mockResolvedValue([]);

      const result = await pricingService.findBestRatePlan('hotel-1', 'rt-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toBeNull();
    });

    it('returns best rate plan when valid', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', roomTypeId: 'rt-1' });
      (prisma.ratePlan.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'rp-1',
          nightlyRate: 200,
          minStay: 1,
          maxAdults: 2,
          maxChildren: 1,
          extraBedPrice: 50,
          cancellationPolicyId: 'cp-1',
          applyDays: null,
        },
      ]);

      const result = await pricingService.findBestRatePlan('hotel-1', 'rt-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-18'));
      expect(result).toEqual({
        ratePlanId: 'rp-1',
        nightlyRate: 200,
        minStay: 1,
        maxAdults: 2,
        maxChildren: 1,
        extraBedPrice: 50,
        cancellationPolicyId: 'cp-1',
      });
    });

    it('filters out rate plans with minStay > nights', async () => {
      (prisma.room.findFirst as vi.Mock).mockResolvedValue({ id: 'room-1', roomTypeId: 'rt-1' });
      (prisma.ratePlan.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'rp-1',
          nightlyRate: 200,
          minStay: 5,
          maxAdults: 2,
          maxChildren: 1,
          extraBedPrice: 50,
          cancellationPolicyId: 'cp-1',
          applyDays: null,
        },
      ]);

      const result = await pricingService.findBestRatePlan('hotel-1', 'rt-1', 'room-1', new Date('2026-08-15'), new Date('2026-08-17'));
      expect(result).toBeNull();
    });
  });

  describe('calculateCancellationRefund', () => {
    it('returns correct refund for tiered policy', () => {
      const rules = JSON.stringify([
        { cancelBeforeHours: 72, refundPercentage: 100 },
        { cancelBeforeHours: 24, refundPercentage: 50 },
        { cancelBeforeHours: 0, refundPercentage: 0 },
      ]);

      const result1 = pricingService.calculateCancellationRefund(rules, 1000, 80);
      expect(result1).toEqual({ refundAmount: 1000, refundPercentage: 100 });

      const result2 = pricingService.calculateCancellationRefund(rules, 1000, 48);
      expect(result2).toEqual({ refundAmount: 500, refundPercentage: 50 });

      const result3 = pricingService.calculateCancellationRefund(rules, 1000, 12);
      expect(result3).toEqual({ refundAmount: 0, refundPercentage: 0 });
    });

    it('handles invalid JSON gracefully', () => {
      const result = pricingService.calculateCancellationRefund('invalid', 1000, 10);
      expect(result).toEqual({ refundAmount: 0, refundPercentage: 0 });
    });
  });
});

describe('BookingService - Public Booking Creation', () => {
  let bookingService: BookingService;

  beforeEach(() => {
    vi.clearAllMocks();
    bookingService = new BookingService();

    (prisma.$transaction as vi.Mock).mockImplementation(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]),
        room: { findFirst: prisma.room.findFirst },
        roomType: { findUnique: prisma.roomType.findUnique, findFirst: prisma.roomType.findFirst },
        ratePlan: { findMany: prisma.ratePlan.findMany, findUnique: prisma.ratePlan.findUnique, findFirst: prisma.ratePlan.findFirst },
        cancellationPolicy: { findUnique: prisma.cancellationPolicy.findUnique, findFirst: prisma.cancellationPolicy.findFirst },
        booking: { create: prisma.booking.create, update: prisma.booking.update },
        folio: { create: prisma.folio.create, update: prisma.folio.update },
        folioTransaction: { create: prisma.folioTransaction.create },
        bookingService: { create: prisma.bookingService.create },
        bookingRoom: { findFirst: prisma.bookingRoom.findFirst },
        guest: { findFirst: prisma.guest.findFirst, create: prisma.guest.create, upsert: prisma.guest.upsert },
      };
      return cb(tx);
    });
  });

  it('creates booking with resolved rate plan and cancellation policy', async () => {
    (prisma.room.findFirst as vi.Mock).mockResolvedValue({
      id: 'room-1',
      roomTypeId: 'rt-1',
      roomType: { baseRate: 300, capacity: 2 },
    });

    (prisma.ratePlan.findMany as vi.Mock).mockResolvedValue([
      {
        id: 'rp-1',
        nightlyRate: 250,
        minStay: 1,
        maxAdults: 2,
        maxChildren: 1,
        extraBedPrice: 50,
        cancellationPolicyId: 'cp-1',
        applyDays: null,
      },
    ]);

    (prisma.cancellationPolicy.findUnique as vi.Mock).mockResolvedValue({
      id: 'cp-1',
      name: 'Flexible',
      rules: JSON.stringify([{ cancelBeforeHours: 24, refundPercentage: 100 }]),
    });

    (prisma.guest.findFirst as vi.Mock).mockResolvedValue(null);
    (prisma.guest.create as vi.Mock).mockResolvedValue({ id: 'guest-1', name: 'Ahmed' });

    (prisma.booking.create as vi.Mock).mockResolvedValue({
      id: 'booking-1',
      bookingNo: 'BK-202608-0001',
      hotelId: 'hotel-1',
      guestName: 'Ahmed',
      guestEmail: 'ahmed@example.com',
      guestPhone: '+218912345678',
      adults: 2,
      children: 0,
      status: 'PENDING',
      source: 'WEBSITE',
      checkIn: new Date('2026-08-15'),
      checkOut: new Date('2026-08-18'),
      rooms: [{ roomId: 'room-1', ratePlanId: 'rp-1', nightlyRate: 250 }],
    });

    (prisma.folio.create as vi.Mock).mockResolvedValue({ id: 'folio-1' });
    (prisma.folioTransaction.create as vi.Mock).mockResolvedValue({});
    (prisma.folio.update as vi.Mock).mockResolvedValue({});
    (prisma.bookingService.create as vi.Mock).mockResolvedValue({});
    (prisma.booking.update as vi.Mock).mockResolvedValue({});

    const result = await bookingService.create({
      hotelId: 'hotel-1',
      guestName: 'Ahmed',
      guestEmail: 'ahmed@example.com',
      guestPhone: '+218912345678',
      adults: 2,
      children: 0,
      checkIn: '2026-08-15',
      checkOut: '2026-08-18',
      rooms: [{ roomId: 'room-1' }],
      source: 'WEBSITE',
    });

    expect(result.bookingNo).toBe('BK-202608-0001');
    expect(result.rooms[0].ratePlanId).toBe('rp-1');
    expect(result.rooms[0].nightlyRate).toBe(250);
  });

  it('throws when room not found in hotel', async () => {
    (prisma.room.findFirst as vi.Mock).mockResolvedValue(null);

    await expect(bookingService.create({
      hotelId: 'hotel-1',
      guestName: 'Ahmed',
      adults: 1,
      children: 0,
      checkIn: '2026-08-15',
      checkOut: '2026-08-18',
      rooms: [{ roomId: 'room-999' }],
      source: 'WEBSITE',
    })).rejects.toThrow('الغرفة غير موجودة');
  });

  it('throws when room is not available', async () => {
    (prisma.room.findFirst as vi.Mock).mockResolvedValue({
      id: 'room-1',
      status: 'OCCUPIED',
      roomType: { baseRate: 300, capacity: 2 },
      roomTypeId: 'rt-1',
    });

    await expect(bookingService.create({
      hotelId: 'hotel-1',
      guestName: 'Ahmed',
      adults: 1,
      children: 0,
      checkIn: '2026-08-15',
      checkOut: '2026-08-18',
      rooms: [{ roomId: 'room-1' }],
      source: 'WEBSITE',
    })).rejects.toThrow('غير متاحة');
  });

  it('creates booking even when guest count exceeds rate plan maxAdults/maxChildren (enforcement is at API level)', async () => {
    (prisma.room.findFirst as vi.Mock).mockResolvedValue({
      id: 'room-1',
      roomTypeId: 'rt-1',
      roomType: { baseRate: 300, capacity: 1 },
      status: 'AVAILABLE',
    });

    (prisma.ratePlan.findMany as vi.Mock).mockResolvedValue([
      {
        id: 'rp-1',
        nightlyRate: 250,
        minStay: 1,
        maxAdults: 1,
        maxChildren: 0,
        extraBedPrice: 50,
        cancellationPolicyId: 'cp-1',
        applyDays: null,
      },
    ]);

    (prisma.guest.findFirst as vi.Mock).mockResolvedValue(null);
    (prisma.guest.create as vi.Mock).mockResolvedValue({ id: 'guest-1', name: 'Ahmed' });

    (prisma.booking.create as vi.Mock).mockResolvedValue({
      id: 'booking-1',
      bookingNo: 'BK-202608-0001',
      hotelId: 'hotel-1',
      guestName: 'Ahmed',
      guestEmail: 'ahmed@example.com',
      guestPhone: '+218912345678',
      adults: 3,
      children: 1,
      status: 'PENDING',
      source: 'WEBSITE',
      checkIn: new Date('2026-08-15'),
      checkOut: new Date('2026-08-18'),
      rooms: [{ roomId: 'room-1', ratePlanId: 'rp-1', nightlyRate: 250 }],
    });

    (prisma.folio.create as vi.Mock).mockResolvedValue({ id: 'folio-1' });
    (prisma.folioTransaction.create as vi.Mock).mockResolvedValue({});
    (prisma.folio.update as vi.Mock).mockResolvedValue({});
    (prisma.bookingService.create as vi.Mock).mockResolvedValue({});
    (prisma.booking.update as vi.Mock).mockResolvedValue({});

    const result = await bookingService.create({
      hotelId: 'hotel-1',
      guestName: 'Ahmed',
      adults: 3,
      children: 1,
      checkIn: '2026-08-15',
      checkOut: '2026-08-18',
      rooms: [{ roomId: 'room-1' }],
      source: 'WEBSITE',
    });

    expect(result.adults).toBe(3);
    expect(result.children).toBe(1);
  });

  it('creates web booking by roomTypeId with roomId null and persists web snapshot', async () => {
    (prisma.roomType.findFirst as vi.Mock).mockResolvedValue({
      id: 'rt-1',
      hotelId: 'hotel-1',
      webPrice: 220,
      baseRate: 300,
      capacity: 2,
    });

    (prisma.ratePlan.findFirst as vi.Mock).mockResolvedValue({
      id: 'rp-1',
      nightlyRate: 250,
      cancellationPolicyId: 'cp-1',
    });

    (prisma.guest.findFirst as vi.Mock).mockResolvedValue(null);
    (prisma.guest.create as vi.Mock).mockResolvedValue({ id: 'guest-1', name: 'Sara' });

    (prisma.booking.create as vi.Mock).mockResolvedValue({
      id: 'booking-1',
      bookingNo: 'BK-202608-0001',
      hotelId: 'hotel-1',
      guestName: 'Sara',
      status: 'PENDING',
      source: 'WEBSITE',
      webTaxAmount: 0,
      webFeesAmount: 0,
      webDiscountAmount: 0,
      webTotalAmount: 660,
      rooms: [{ roomId: null, roomTypeId: 'rt-1', ratePlanId: 'rp-1', nightlyRate: 220 }],
    });

    (prisma.folio.create as vi.Mock).mockResolvedValue({ id: 'folio-1' });
    (prisma.folioTransaction.create as vi.Mock).mockResolvedValue({});
    (prisma.folio.update as vi.Mock).mockResolvedValue({});
    (prisma.bookingService.create as vi.Mock).mockResolvedValue({});
    (prisma.booking.update as vi.Mock).mockResolvedValue({});

    const result = await bookingService.create({
      hotelId: 'hotel-1',
      guestName: 'Sara',
      guestEmail: 'sara@example.com',
      adults: 2,
      children: 0,
      checkIn: '2026-08-15',
      checkOut: '2026-08-18',
      rooms: [{ roomTypeId: 'rt-1', nightlyRate: 220 }],
      source: 'WEBSITE',
      webTaxAmount: 0,
      webFeesAmount: 0,
      webDiscountAmount: 0,
      webTotalAmount: 660,
    });

    expect(result.bookingNo).toBe('BK-202608-0001');
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webTotalAmount: 660,
          rooms: {
            create: [
              expect.objectContaining({
                roomId: null,
                roomTypeId: 'rt-1',
                nightlyRate: 220,
              }),
            ],
          },
        }),
      })
    );
  });

  it('throws when roomTypeId is missing for a web booking', async () => {
    await expect(bookingService.create({
      hotelId: 'hotel-1',
      guestName: 'Sara',
      adults: 1,
      children: 0,
      checkIn: '2026-08-15',
      checkOut: '2026-08-18',
      rooms: [{ nightlyRate: 220 }],
      source: 'WEBSITE',
    })).rejects.toThrow('يجب تحديد غرفة أو نوع غرفة');
  });
});