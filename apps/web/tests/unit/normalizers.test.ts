import { describe, it, expect } from 'vitest';
import { normalizeExternalBooking } from '@/lib/integrations/normalizers';

describe('normalizeExternalBooking - custom engine', () => {
  it('normalizes a valid canonical payload for custom engine', () => {
    const payload = {
      externalRef: 'ext-12345',
      guestName: 'Ahmed Al-Mansouri',
      guestEmail: 'ahmed@example.com',
      guestPhone: '+218912345678',
      adults: 2,
      children: 1,
      checkIn: '2026-08-15T14:00:00.000Z',
      checkOut: '2026-08-18T12:00:00.000Z',
      rooms: [
        { roomId: 'room-uuid-1', nightlyRate: 250 },
        { roomId: 'room-uuid-2', nightlyRate: 300 },
      ],
      payment: {
        method: 'CASH',
        amount: 1100,
        currency: 'LYD',
        reference: 'txn-ref-001',
      },
    };

    const result = normalizeExternalBooking('custom', payload);

    expect(result).toEqual({
      externalRef: 'ext-12345',
      guestName: 'Ahmed Al-Mansouri',
      guestEmail: 'ahmed@example.com',
      guestPhone: '+218912345678',
      adults: 2,
      children: 1,
      checkIn: '2026-08-15T14:00:00.000Z',
      checkOut: '2026-08-18T12:00:00.000Z',
      rooms: [
        { roomId: 'room-uuid-1', nightlyRate: 250 },
        { roomId: 'room-uuid-2', nightlyRate: 300 },
      ],
      payment: {
        method: 'CASH',
        amount: 1100,
        currency: 'LYD',
        reference: 'txn-ref-001',
      },
    });
  });

  it('applies defaults for optional fields when omitted', () => {
    const payload = {
      externalRef: 'ext-minimal',
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
      rooms: [{ roomId: 'room-uuid-3' }],
      payment: { method: 'CARD', amount: 500 },
    };

    const result = normalizeExternalBooking('custom', payload);

    expect(result.adults).toBe(1);
    expect(result.children).toBe(0);
    expect(result.payment.currency).toBe('LYD');
    expect(result.rooms[0].nightlyRate).toBeUndefined();
  });

  it('throws on missing required externalRef', () => {
    const payload = {
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
      rooms: [{ roomId: 'room-uuid-4' }],
      payment: { method: 'CASH', amount: 100 },
    };

    expect(() => normalizeExternalBooking('custom', payload)).toThrow('Required');
  });

  it('throws on missing required rooms', () => {
    const payload = {
      externalRef: 'ext-no-rooms',
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
      rooms: [],
      payment: { method: 'CASH', amount: 100 },
    };

    expect(() => normalizeExternalBooking('custom', payload)).toThrow('يجب تحديد غرفة واحدة على الأقل');
  });

  it('throws on invalid payment amount', () => {
    const payload = {
      externalRef: 'ext-bad-amount',
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
      rooms: [{ roomId: 'room-uuid-5' }],
      payment: { method: 'CASH', amount: -50 },
    };

    expect(() => normalizeExternalBooking('custom', payload)).toThrow('المبلغ يجب أن يكون أكبر من صفر');
  });

  it('throws on missing payment method', () => {
    const payload = {
      externalRef: 'ext-no-method',
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
      rooms: [{ roomId: 'room-uuid-6' }],
      payment: { amount: 100 },
    };

    expect(() => normalizeExternalBooking('custom', payload)).toThrow('Required');
  });
});