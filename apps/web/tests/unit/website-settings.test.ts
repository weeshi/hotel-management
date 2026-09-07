import { describe, it, expect } from 'vitest';
import { WebsiteSettingsService } from '@/lib/services/website-settings.service';

const service = new WebsiteSettingsService();

describe('WebsiteSettingsService.computeWebPricing', () => {
  it('should compute plain total without fees', () => {
    const result = service.computeWebPricing({ nightlyRate: 250, nights: 2 });
    expect(result.subtotal).toBe(500);
    expect(result.total).toBe(500);
    expect(result.nights).toBe(2);
  });

  it('should apply discount before tax', () => {
    const result = service.computeWebPricing({ nightlyRate: 250, nights: 2, discountPercent: 10, taxRate: 15, bookingFee: 20 });
    expect(result.subtotal).toBe(500);
    expect(result.discountAmount).toBe(50);
    expect(result.taxAmount).toBe(67.5);
    expect(result.total).toBe(500 - 50 + 67.5 + 20);
  });

  it('should round total to two decimals', () => {
    const result = service.computeWebPricing({ nightlyRate: 99.99, nights: 3, taxRate: 10 });
    const expected = 99.99 * 3 + (99.99 * 3 * 10) / 100;
    expect(result.total).toBe(Math.round(expected * 100) / 100);
  });

  it('should handle zero settings', () => {
    const result = service.computeWebPricing({ nightlyRate: 100, nights: 1, taxRate: 0, bookingFee: 0, discountPercent: 0 });
    expect(result.total).toBe(100);
  });
});
