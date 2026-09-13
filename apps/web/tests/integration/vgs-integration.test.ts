import { describe, it, expect } from 'vitest';
import { isValidVCCProvider, validateVCCPaymentTokens, normalizeVCCWebhook } from '@/lib/integrations/vcc-normalizer';

describe('VGS Integration — Normalizer (Unit Tests)', () => {
  describe('Provider validation', () => {
    it('should accept valid providers', () => {
      expect(isValidVCCProvider('booking.com')).toBe(true);
      expect(isValidVCCProvider('expedia')).toBe(true);
      expect(isValidVCCProvider('airbnb')).toBe(true);
      expect(isValidVCCProvider('agoda')).toBe(true);
      expect(isValidVCCProvider('trip')).toBe(true);
      expect(isValidVCCProvider('other')).toBe(true);
    });

    it('should reject invalid providers', () => {
      expect(isValidVCCProvider('invalid')).toBe(false);
      expect(isValidVCCProvider('')).toBe(false);
    });
  });

  describe('Normalizer — Booking.com', () => {
    it('should normalize tokenized Booking.com payload', () => {
      const tokenized = {
        reservation: {
          reservation_number: "BK-TEST-20260915-001",
          status: "confirmed",
          arrival_date: "2026-10-15",
          departure_date: "2026-10-18",
          adults: 2,
          children: 0,
          guest: { name: "Ahmed Al-Mansouri", email: "ahmed@example.com" },
          room_type_id: "DBL-STD",
          rate_plan_id: "RATE-FLEX-2026",
          payment: {
            card_number: "tok_visa_abc123",
            expiry_date: "tok_exp_xyz789",
            cvv: "tok_cvv_uvw012",
            holder_name: "BOOKING.COM GUEST",
            amount: 900,
            currency: "EUR",
            virtual_card: true,
          },
          vgs_metadata: {
            vault_id: "vlt_dev_123",
            tokenized_at: "2026-09-15T10:30:00Z",
            proxy_version: "dev-simulator",
          },
        },
        hotel_id: "default-hotel",
      };

      const normalized = normalizeVCCWebhook('booking.com', tokenized);

      expect(normalized.externalRef).toBe("BK-TEST-20260915-001");
      expect(normalized.provider).toBe("booking.com");
      expect(normalized.guestName).toBe("Ahmed Al-Mansouri");
      expect(normalized.checkIn).toBe("2026-10-15");
      expect(normalized.checkOut).toBe("2026-10-18");
      expect(normalized.channelRoomTypeId).toBe("DBL-STD");
      expect(normalized.payment.tokens.cardToken).toBe("tok_visa_abc123");
      expect(normalized.payment.tokens.expiryToken).toBe("tok_exp_xyz789");
      expect(normalized.payment.tokens.cvvToken).toBe("tok_cvv_uvw012");
      expect(normalized.payment.tokens.holderName).toBe("BOOKING.COM GUEST");
      expect(normalized.payment.amount).toBe(900);
      expect(normalized.payment.currency).toBe("EUR");
      expect(normalized.vgsMetadata.vaultId).toBe("vlt_dev_123");
      expect(normalized.vgsMetadata.originalProvider).toBe("booking.com");
    });
  });

  describe('Normalizer — Expedia', () => {
    it('should normalize tokenized Expedia payload', () => {
      const tokenized = {
        itinerary: {
          itinerary_id: "EXP-TEST-987654321",
          status: "booked",
          checkIn: "2026-11-01",
          checkOut: "2026-11-05",
          adults: 2,
          children: 1,
          guestInfo: { guestFirstName: "Fatima", guestLastName: "Al-Zahra" },
          room_type_id: "SUP-DLX",
          rate_plan_id: "RATE-NONREF-2026",
          payment: {
            card_number: "tok_visa_abc123",
            expiry_date: "tok_exp_xyz789",
            cvv: "tok_cvv_uvw012",
            holder_name: "EXPEDIA GUEST",
            amount: 2400,
            currency: "USD",
          },
          vgs_metadata: {
            vault_id: "vlt_dev_123",
            tokenized_at: "2026-09-15T10:30:00Z",
          },
        },
        hotel_id: "default-hotel",
      };

      const normalized = normalizeVCCWebhook('expedia', tokenized);

      expect(normalized.provider).toBe("expedia");
      expect(normalized.externalRef).toBe("EXP-TEST-987654321");
      expect(normalized.guestName).toBe("Fatima Al-Zahra");
      expect(normalized.checkIn).toBe("2026-11-01");
      expect(normalized.checkOut).toBe("2026-11-05");
      expect(normalized.channelRoomTypeId).toBe("SUP-DLX");
      expect(normalized.payment.currency).toBe("USD");
      expect(normalized.vgsMetadata.originalProvider).toBe("expedia");
    });
  });

  describe('Normalizer — Generic (Airbnb/Agoda/Trip)', () => {
    it('should normalize generic OTA payload', () => {
      const tokenized = {
        external_ref: "AIR-TEST-111222",
        provider: "airbnb",
        guest_name: "Mohamed Ali",
        guest_email: "mohamed@example.com",
        adults: 1,
        children: 0,
        check_in: "2026-12-20",
        check_out: "2026-12-25",
        channel_room_type_id: "AIR-ENTIRE-HOME",
        payment: {
          card_number: "tok_visa_abc123",
          expiry_date: "tok_exp_xyz789",
          cvv: "tok_cvv_uvw012",
          holder_name: "AIRBNB GUEST",
          amount: 1500,
          currency: "LYD",
        },
        vgs_metadata: { vault_id: "vlt_dev_123" },
        hotel_id: "default-hotel",
      };

      const normalized = normalizeVCCWebhook('airbnb', tokenized);

      expect(normalized.provider).toBe("airbnb");
      expect(normalized.externalRef).toBe("AIR-TEST-111222");
      expect(normalized.guestName).toBe("Mohamed Ali");
      expect(normalized.channelRoomTypeId).toBe("AIR-ENTIRE-HOME");
      expect(normalized.payment.currency).toBe("LYD");
    });
  });

  describe('Token validation', () => {
    it('should reject invalid token format', () => {
      const invalid = {
        cardToken: "invalid-token",
        expiryToken: "tok_exp_xyz789",
        cvvToken: "tok_cvv_uvw012",
        holderName: "GUEST",
      };

      const result = validateVCCPaymentTokens(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cardToken غير صالح (يجب أن يكون بتنسيق tok_xxx_yyy)');
    });

    it('should accept valid tokens', () => {
      const valid = {
        cardToken: "tok_visa_abc123",
        expiryToken: "tok_exp_xyz789",
        cvvToken: "tok_cvv_uvw012",
        holderName: "GUEST",
      };

      const result = validateVCCPaymentTokens(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('Provider validation', () => {
  it('should accept valid providers', () => {
    expect(isValidVCCProvider('booking.com')).toBe(true);
    expect(isValidVCCProvider('expedia')).toBe(true);
    expect(isValidVCCProvider('airbnb')).toBe(true);
    expect(isValidVCCProvider('agoda')).toBe(true);
    expect(isValidVCCProvider('trip')).toBe(true);
    expect(isValidVCCProvider('other')).toBe(true);
  });

  it('should reject invalid providers', () => {
    expect(isValidVCCProvider('invalid')).toBe(false);
    expect(isValidVCCProvider('')).toBe(false);
  });
});

describe('Token validation', () => {
  it('should reject invalid token format', () => {
    const invalid = {
      cardToken: "invalid-token",
      expiryToken: "tok_exp_xyz789",
      cvvToken: "tok_cvv_uvw012",
      holderName: "GUEST",
    };
    const result = validateVCCPaymentTokens(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cardToken غير صالح (يجب أن يكون بتنسيق tok_xxx_yyy)');
  });

  it('should accept valid tokens', () => {
    const valid = {
      cardToken: "tok_visa_abc123",
      expiryToken: "tok_exp_xyz789",
      cvvToken: "tok_cvv_uvw012",
      holderName: "GUEST",
    };
    const result = validateVCCPaymentTokens(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});