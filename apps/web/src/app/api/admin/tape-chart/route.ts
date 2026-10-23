import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/utils/prisma';
import { withAuth, type AuthenticatedRequest } from '@/middlewares/auth';
import { AppError } from '@/lib/utils/errors';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const ROOM_STATUS_VALUES = [
  'AVAILABLE',
  'OCCUPIED',
  'DIRTY',
  'CLEANING',
  'MAINTENANCE',
  'OUT_OF_ORDER',
] as const;

const BOOKING_STATUS_VALUES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
] as const;

const ACTIVE_UNASSIGNED_STATUSES = ['CONFIRMED', 'PENDING'];
const DEFAULT_GRID_STATUSES = ['CONFIRMED', 'CHECKED_IN'];

function isRoomStatus(value: string | null): value is (typeof ROOM_STATUS_VALUES)[number] {
  return value !== null && (ROOM_STATUS_VALUES as readonly string[]).includes(value);
}

function isBookingStatus(value: string | null): value is (typeof BOOKING_STATUS_VALUES)[number] {
  return value !== null && (BOOKING_STATUS_VALUES as readonly string[]).includes(value);
}

function parseFloor(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function handler(request: AuthenticatedRequest) {
  try {
    const hotelId = request.user?.hotelId;
    if (!hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.trim() || undefined;
    const roomTypeId = searchParams.get('roomTypeId') || undefined;
    const floor = parseFloor(searchParams.get('floor'));
    const status = searchParams.get('status');
    const roomStatusFilter = isRoomStatus(status) ? status : undefined;
    const bookingStatusFilter = isBookingStatus(status) ? status : undefined;

    const fromRaw = parseDate(searchParams.get('from'));
    const fromDate = fromRaw ?? new Date();
    fromDate.setHours(0, 0, 0, 0);

    const toRaw = parseDate(searchParams.get('to'));
    let toDate: Date;
    if (toRaw) {
      toDate = toRaw;
    } else {
      toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 14);
    }
    toDate.setHours(23, 59, 59, 999);

    const roomWhere: Prisma.RoomWhereInput = { hotelId };
    if (roomTypeId) roomWhere.roomTypeId = roomTypeId;
    if (floor !== undefined) roomWhere.floor = floor;
    if (roomStatusFilter) roomWhere.status = roomStatusFilter;

    const bookingRoomRoomWhere: Prisma.RoomWhereInput = { hotelId };
    if (roomTypeId) bookingRoomRoomWhere.roomTypeId = roomTypeId;
    if (floor !== undefined) bookingRoomRoomWhere.floor = floor;

    const bookingWhere: Prisma.BookingWhereInput = {
      status: bookingStatusFilter ? bookingStatusFilter : { in: DEFAULT_GRID_STATUSES },
    };
    if (search) {
      bookingWhere.OR = [
        { bookingNo: { contains: search, mode: 'insensitive' } },
        { guestName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const unassignedStatuses =
      bookingStatusFilter === 'CONFIRMED' || bookingStatusFilter === 'PENDING'
        ? [bookingStatusFilter]
        : ACTIVE_UNASSIGNED_STATUSES;

    const unassignedBookingWhere: Prisma.BookingWhereInput = {
      status: { in: unassignedStatuses },
    };
    if (search) {
      unassignedBookingWhere.OR = [
        { bookingNo: { contains: search, mode: 'insensitive' } },
        { guestName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const unassignedWhere: Prisma.BookingRoomWhereInput = {
      hotelId,
      roomId: null,
      checkIn: { lte: toDate },
      checkOut: { gte: fromDate },
      booking: unassignedBookingWhere,
    };
    if (roomTypeId) unassignedWhere.roomTypeId = roomTypeId;

    const [rooms, bookingRooms, unassignedBookings, roomTypes, floorRows] = await Promise.all([
      prisma.room.findMany({
        where: roomWhere,
        include: {
          roomType: { select: { id: true, name: true, nameAr: true, baseRate: true } },
        },
        orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
      }),
      prisma.bookingRoom.findMany({
        where: {
          room: bookingRoomRoomWhere,
          checkIn: { lte: toDate },
          checkOut: { gte: fromDate },
          booking: bookingWhere,
        },
        include: {
          room: { select: { id: true, roomNumber: true, floor: true } },
          booking: {
            select: {
              id: true,
              bookingNo: true,
              guestName: true,
              guestPhone: true,
              status: true,
              folio: { select: { balance: true } },
            },
          },
        },
        orderBy: { checkIn: 'asc' },
      }),
      prisma.bookingRoom.findMany({
        where: unassignedWhere,
        include: {
          roomType: { select: { id: true, name: true, nameAr: true } },
          booking: {
            select: {
              id: true,
              bookingNo: true,
              guestName: true,
              guestPhone: true,
              status: true,
              source: true,
              folio: { select: { balance: true } },
            },
          },
        },
        orderBy: { checkIn: 'asc' },
      }),
      prisma.roomType.findMany({
        where: { hotelId },
        select: { id: true, name: true, nameAr: true },
        orderBy: { name: 'asc' },
      }),
      prisma.room.findMany({
        where: { hotelId },
        select: { floor: true },
        orderBy: { floor: 'asc' },
      }),
    ]);

    const floors = Array.from(
      new Set(
        floorRows
          .map((row) => row.floor)
          .filter((value): value is number => value !== null),
      ),
    ).sort((a, b) => a - b);

    return successResponse({
      rooms: rooms.map((r) => ({
        id: r.id,
        roomNumber: r.roomNumber,
        floor: r.floor,
        status: r.status,
        housekeepingStatus: r.housekeepingStatus,
        roomType: r.roomType,
      })),
      bookingRooms: bookingRooms.map((br) => ({
        id: br.id,
        bookingId: br.booking.id,
        bookingNo: br.booking.bookingNo,
        guestName: br.booking.guestName,
        guestPhone: br.booking.guestPhone,
        status: br.booking.status,
        roomId: br.roomId,
        roomNumber: br.room?.roomNumber,
        checkIn: br.checkIn,
        checkOut: br.checkOut,
        folioBalance: Number(br.booking.folio?.balance || 0),
      })),
      unassignedBookings: unassignedBookings.map((br) => ({
        bookingRoomId: br.id,
        bookingId: br.booking.id,
        bookingNo: br.booking.bookingNo,
        guestName: br.booking.guestName,
        guestPhone: br.booking.guestPhone,
        status: br.booking.status,
        source: br.booking.source,
        roomId: br.roomId,
        roomTypeId: br.roomTypeId,
        roomTypeName: br.roomType ? br.roomType.nameAr || br.roomType.name : null,
        checkIn: br.checkIn,
        checkOut: br.checkOut,
        folioBalance: Number(br.booking.folio?.balance || 0),
      })),
      filterOptions: { roomTypes, floors },
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'فشل جلب بيانات المخطط الزمني';
    const status = error instanceof AppError ? error.statusCode : 400;
    return errorResponse(message, status);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'RECEPTION']);
