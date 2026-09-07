// --- Calendar & Date Range Helpers (local-timezone safe) ---

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, days: number): string {
  const d = parseISODate(value);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = parseISODate(checkOut).getTime() - parseISODate(checkIn).getTime();
  return Math.round(diff / 86400000);
}

// --- Month Grid ---
// Returns weeks (7 columns, Sunday first); empty cells are `null`, days are ISO strings.

export function getMonthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ISO date strings compare lexicographically, so `>=` / `<=` work as date range checks.
export function isDateInRange(day: string, checkIn: string, checkOut: string): boolean {
  return Boolean(checkIn && checkOut && day >= checkIn && day <= checkOut);
}

// --- Capacity Filter ---
// Rooms returned by the availability API carry maxAdults/maxChildren; only rooms
// that fit the requested party are shown to the guest.

export function filterRoomsByCapacity<T extends { maxAdults: number; maxChildren: number }>(
  rooms: T[],
  adults: number,
  children: number
): T[] {
  return rooms.filter((room) => adults <= room.maxAdults && children <= room.maxChildren);
}
