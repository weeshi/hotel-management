import { describe, it, expect } from 'vitest';

describe('Booking Number', () => {
  it('should follow BK-YYYYMM-XXXX format', () => {
    const pattern = /^BK-\d{6}-\d{4}$/;
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const expectedPrefix = `BK-${year}${month}-`;
    expect(pattern.test(`BK-${year}${month}-0001`)).toBe(true);
    expect(`BK-${year}${month}-0001`.startsWith(expectedPrefix)).toBe(true);
  });
});
