import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  createBookingSchema,
  createPaymentSchema,
  createRoomTypeSchema,
  addFolioChargeSchema,
  applyDiscountSchema,
  paginationSchema,
} from '@hotel/shared';

describe('Shared Schemas', () => {
  describe('loginSchema', () => {
    it('should validate valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '123456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: '123456',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate valid registration data', () => {
      const result = registerSchema.safeParse({
        name: 'محمد',
        email: 'user@example.com',
        password: '123456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short name', () => {
      const result = registerSchema.safeParse({
        name: 'أ',
        email: 'user@example.com',
        password: '123456',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createBookingSchema', () => {
    it('should validate valid booking data', () => {
      const result = createBookingSchema.safeParse({
        checkIn: '2026-06-15T14:00:00Z',
        checkOut: '2026-06-18T12:00:00Z',
        rooms: [{ roomId: '550e8400-e29b-41d4-a716-446655440000', nightlyRate: 250 }],
        guestName: 'ضيف تجريبي',
      });
      expect(result.success).toBe(true);
    });

    it('should reject booking without rooms', () => {
      const result = createBookingSchema.safeParse({
        checkIn: '2026-06-15T14:00:00Z',
        checkOut: '2026-06-18T12:00:00Z',
        rooms: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPaymentSchema', () => {
    it('should validate valid payment', () => {
      const result = createPaymentSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 500,
        method: 'CASH',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('paginationSchema', () => {
    it('should default page and limit', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });
  });
});
