/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import {
  toISODate,
  parseISODate,
  addDays,
  todayISO,
  nightsBetween,
  getMonthGrid,
  isDateInRange,
  filterRoomsByCapacity,
} from '@/lib/utils/calendar';

describe('Calendar & Date Range Utils', () => {
  describe('toISODate / parseISODate', () => {
    it('formats a Date as YYYY-MM-DD in local time', () => {
      expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('parses YYYY-MM-DD back into a local Date', () => {
      const d = parseISODate('2026-08-05');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(5);
    });

    it('is an inverse of parseISODate', () => {
      expect(toISODate(parseISODate('2026-08-05'))).toBe('2026-08-05');
    });
  });

  describe('addDays', () => {
    it('adds days across month boundaries', () => {
      expect(addDays('2026-01-30', 2)).toBe('2026-02-01');
      expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    });

    it('supports negative deltas', () => {
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
  });

  describe('todayISO', () => {
    it('returns the current local date as YYYY-MM-DD', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(todayISO()).toBe(expected);
    });
  });

  describe('nightsBetween', () => {
    it('counts full nights between two dates', () => {
      expect(nightsBetween('2026-08-05', '2026-08-07')).toBe(2);
      expect(nightsBetween('2026-08-05', '2026-08-05')).toBe(0);
    });

    it('handles month and year boundaries', () => {
      expect(nightsBetween('2026-08-30', '2026-09-02')).toBe(3);
      expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3);
    });
  });

  describe('getMonthGrid', () => {
    it('produces full 7-column weeks', () => {
      const grid = getMonthGrid(2026, 7); // August 2026 starts on a Saturday
      for (const week of grid) {
        expect(week).toHaveLength(7);
      }
      const dayCount = grid.flat().filter((d) => d !== null).length;
      expect(dayCount).toBe(31);
    });

    it('pads leading nulls before the first day of month', () => {
      const grid = getMonthGrid(2026, 7); // Aug 1 2026 = Saturday (getDay 6)
      const firstWeek = grid[0];
      expect(firstWeek.filter((d) => d !== null)).toHaveLength(1);
      expect(firstWeek.find((d) => d !== null)).toBe('2026-08-01');
    });
  });

  describe('isDateInRange', () => {
    it('returns true only when the day falls inside [checkIn, checkOut]', () => {
      expect(isDateInRange('2026-08-06', '2026-08-05', '2026-08-08')).toBe(true);
      expect(isDateInRange('2026-08-05', '2026-08-05', '2026-08-08')).toBe(true);
      expect(isDateInRange('2026-08-08', '2026-08-05', '2026-08-08')).toBe(true);
      expect(isDateInRange('2026-08-04', '2026-08-05', '2026-08-08')).toBe(false);
      expect(isDateInRange('2026-08-09', '2026-08-05', '2026-08-08')).toBe(false);
    });

    it('returns false when a boundary is missing', () => {
      expect(isDateInRange('2026-08-06', '', '2026-08-08')).toBe(false);
      expect(isDateInRange('2026-08-06', '2026-08-05', '')).toBe(false);
    });
  });

  describe('filterRoomsByCapacity', () => {
    const rooms = [
      { roomId: 'a', maxAdults: 2, maxChildren: 1 },
      { roomId: 'b', maxAdults: 4, maxChildren: 2 },
      { roomId: 'c', maxAdults: 1, maxChildren: 0 },
    ];

    it('keeps only rooms that fit the party size', () => {
      const result = filterRoomsByCapacity(rooms, 2, 1);
      expect(result.map((r) => r.roomId)).toEqual(['a', 'b']);
    });

    it('drops rooms when children exceed capacity', () => {
      const result = filterRoomsByCapacity(rooms, 2, 2);
      expect(result.map((r) => r.roomId)).toEqual(['b']);
    });

    it('fits a solo adult in any room', () => {
      const result = filterRoomsByCapacity(rooms, 1, 0);
      expect(result).toHaveLength(3);
    });

    it('returns empty when no room fits', () => {
      expect(filterRoomsByCapacity(rooms, 5, 0)).toEqual([]);
    });
  });
});
