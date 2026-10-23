import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as tapeChartGET } from '@/app/api/admin/tape-chart/route';
import { signAccessToken } from '@/lib/utils/jwt';
import { prismaRaw, resetDb, seedTestData, closeDb } from '../helpers/db';

let data: Awaited<ReturnType<typeof seedTestData>>;

const BASE = new Date();
BASE.setHours(0, 0, 0, 0);

const IN_CHECK_IN = new Date(BASE.getTime() + 1 * 86400000);
const IN_CHECK_OUT = new Date(BASE.getTime() + 3 * 86400000);
const LATE_CHECK_IN = new Date(BASE.getTime() + 20 * 86400000);
const LATE_CHECK_OUT = new Date(BASE.getTime() + 22 * 86400000);

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FROM_STR = localDateStr(BASE);
const TO_STR = localDateStr(new Date(BASE.getTime() + 10 * 86400000));

interface TapeChartRoomPayload {
  id: string;
  roomNumber: string;
  floor: number | null;
  status: string;
  roomType: { id: string };
}

interface TapeChartBookingRoomPayload {
  id: string;
  bookingNo: string;
  roomId: string | null;
  status: string;
}

interface TapeChartUnassignedPayload {
  bookingRoomId: string;
  bookingNo: string;
  status: string;
  source: string;
  roomId: string | null;
  roomTypeId: string | null;
}

interface TapeChartResponsePayload {
  rooms: TapeChartRoomPayload[];
  bookingRooms: TapeChartBookingRoomPayload[];
  unassignedBookings: TapeChartUnassignedPayload[];
  filterOptions: { roomTypes: { id: string }[]; floors: number[] };
  dateRange: { from: string; to: string };
}

interface TapeChartApiResponse {
  success: boolean;
  data: TapeChartResponsePayload;
}

async function callTapeChart(extraQuery = ''): Promise<TapeChartApiResponse> {
  const token = await signAccessToken({
    userId: data.admin.id,
    role: 'ADMIN',
    hotelId: data.hotel.id,
  });
  const query = `from=${FROM_STR}&to=${TO_STR}${extraQuery ? `&${extraQuery}` : ''}`;
  const request = new NextRequest(`http://localhost/api/admin/tape-chart?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const response = await tapeChartGET(request, {});
  return (await response.json()) as TapeChartApiResponse;
}

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();

  await prismaRaw.room.create({
    data: {
      hotelId: data.hotel.id,
      roomNumber: '201',
      floor: 2,
      roomTypeId: data.singleType.id,
      status: 'AVAILABLE',
    },
  });

  await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'BK-ALPHA-001',
      guestName: 'Alice',
      status: 'CONFIRMED',
      source: 'RECEPTION',
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomId: data.room101.id,
            roomTypeId: data.singleType.id,
            nightlyRate: 200,
            checkIn: IN_CHECK_IN,
            checkOut: IN_CHECK_OUT,
          },
        ],
      },
    },
  });

  await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'BK-CAROL-002',
      guestName: 'Carol',
      status: 'CONFIRMED',
      source: 'RECEPTION',
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomId: data.room102.id,
            roomTypeId: data.doubleType.id,
            nightlyRate: 300,
            checkIn: IN_CHECK_IN,
            checkOut: IN_CHECK_OUT,
          },
        ],
      },
    },
  });

  await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'BK-WEB-003',
      guestName: 'Bob',
      status: 'PENDING',
      source: 'WEBSITE',
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomTypeId: data.singleType.id,
            nightlyRate: 200,
            checkIn: IN_CHECK_IN,
            checkOut: IN_CHECK_OUT,
          },
        ],
      },
    },
  });

  await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'BK-WEB-005',
      guestName: 'Dave',
      status: 'CONFIRMED',
      source: 'WEBSITE',
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomTypeId: data.doubleType.id,
            nightlyRate: 300,
            checkIn: IN_CHECK_IN,
            checkOut: IN_CHECK_OUT,
          },
        ],
      },
    },
  });

  await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'BK-CANCEL-004',
      guestName: 'Cara',
      status: 'CANCELLED',
      source: 'WEBSITE',
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomTypeId: data.singleType.id,
            nightlyRate: 200,
            checkIn: IN_CHECK_IN,
            checkOut: IN_CHECK_OUT,
          },
        ],
      },
    },
  });

  await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'BK-LATE-006',
      guestName: 'Eve',
      status: 'PENDING',
      source: 'WEBSITE',
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomTypeId: data.singleType.id,
            nightlyRate: 200,
            checkIn: LATE_CHECK_IN,
            checkOut: LATE_CHECK_OUT,
          },
        ],
      },
    },
  });
});

afterAll(async () => {
  await closeDb();
});

describe('Tape Chart PRO — grid & unassigned payload', () => {
  it('returns the room grid, filter options and unassigned lane', async () => {
    const body = await callTapeChart();

    expect(body.success).toBe(true);
    expect(body.data.rooms.map(r => r.roomNumber).sort()).toEqual(['101', '102', '201']);
    expect(body.data.bookingRooms).toHaveLength(2);
    expect(body.data.filterOptions.roomTypes).toHaveLength(2);
    expect(body.data.filterOptions.floors).toEqual([1, 2]);

    const bob = body.data.unassignedBookings.find(b => b.bookingNo === 'BK-WEB-003');
    expect(bob).toBeDefined();
    expect(bob?.roomId).toBeNull();
    expect(bob?.roomTypeId).toBe(data.singleType.id);
    expect(bob?.status).toBe('PENDING');
    expect(bob?.source).toBe('WEBSITE');
    expect(bob?.bookingRoomId).toBeTruthy();
  });

  it('excludes cancelled and out-of-window room-type bookings from the lane', async () => {
    const body = await callTapeChart();
    const numbers = body.data.unassignedBookings.map(b => b.bookingNo);

    expect(numbers).toContain('BK-WEB-003');
    expect(numbers).toContain('BK-WEB-005');
    expect(numbers).not.toContain('BK-CANCEL-004');
    expect(numbers).not.toContain('BK-LATE-006');
  });
});

describe('Tape Chart PRO — filtering', () => {
  it('filters bookings by guest name / booking number with q', async () => {
    const body = await callTapeChart('q=Alice');

    expect(body.data.bookingRooms).toHaveLength(1);
    expect(body.data.bookingRooms[0].bookingNo).toBe('BK-ALPHA-001');
    expect(body.data.rooms).toHaveLength(3);
    expect(body.data.unassignedBookings).toHaveLength(0);
  });

  it('filters by roomTypeId across grid and unassigned lane', async () => {
    const body = await callTapeChart(`roomTypeId=${data.doubleType.id}`);

    expect(body.data.rooms.map(r => r.roomNumber)).toEqual(['102']);
    expect(body.data.bookingRooms).toHaveLength(1);
    expect(body.data.bookingRooms[0].bookingNo).toBe('BK-CAROL-002');

    const unassignedNumbers = body.data.unassignedBookings.map(b => b.bookingNo);
    expect(unassignedNumbers).toEqual(['BK-WEB-005']);
  });

  it('filters rooms by floor without dropping the unassigned lane', async () => {
    const body = await callTapeChart('floor=2');

    expect(body.data.rooms.map(r => r.roomNumber)).toEqual(['201']);
    expect(body.data.bookingRooms).toHaveLength(0);
    expect(body.data.unassignedBookings.map(b => b.bookingNo).sort()).toEqual([
      'BK-WEB-003',
      'BK-WEB-005',
    ]);
  });

  it('filters by booking status for the grid and unassigned lane', async () => {
    const body = await callTapeChart('status=PENDING');

    expect(body.data.bookingRooms).toHaveLength(0);
    expect(body.data.unassignedBookings.map(b => b.bookingNo)).toEqual(['BK-WEB-003']);
  });
});
