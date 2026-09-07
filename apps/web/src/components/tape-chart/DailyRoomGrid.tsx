'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { TapeChartRoom, TapeChartBooking } from './types';

interface Props {
  rooms: TapeChartRoom[];
  bookingRooms: TapeChartBooking[];
  selectedDate: string;
}

const ROOM_CARD_HEIGHT = 72;

function isRoomOccupied(roomId: string, bookingRooms: TapeChartBooking[], date: Date): TapeChartBooking | undefined {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dateEnd = new Date(dateStart.getTime() + 86400000);
  return bookingRooms.find(b => {
    if (b.roomId !== roomId) return false;
    const ci = new Date(b.checkIn);
    const co = new Date(b.checkOut);
    return ci < dateEnd && co > dateStart;
  });
}

export function DailyRoomGrid({ rooms, bookingRooms, selectedDate }: Props) {
  const router = useRouter();

  const dateObj = useMemo(() => new Date(selectedDate + 'T12:00:00'), [selectedDate]);

  const roomGroups = useMemo(() => {
    const groups: { floor: number; rooms: TapeChartRoom[] }[] = [];
    for (const room of rooms) {
      const floor = room.floor ?? 0;
      let group = groups.find(g => g.floor === floor);
      if (!group) {
        group = { floor, rooms: [] };
        groups.push(group);
      }
      group.rooms.push(room);
    }
    return groups.sort((a, b) => a.floor - b.floor);
  }, [rooms]);

  return (
    <div className="space-y-4">
      {roomGroups.map(group => (
        <div key={group.floor}>
          <div className="text-xs font-bold text-[var(--text-muted)] px-1 py-2">
            الطابق {group.floor}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {group.rooms.map(room => {
              const booking = isRoomOccupied(room.id, bookingRooms, dateObj);
              const isAvailable = room.status === 'AVAILABLE' || room.status === 'DIRTY';

              return (
                <div
                  key={room.id}
                  onClick={() => {
                    if (isAvailable) {
                      router.push(`/reception/bookings/new?roomId=${room.id}&checkIn=${selectedDate}`);
                    }
                  }}
                  className={`rounded-xl border p-3 transition-all ${
                    booking
                      ? 'border-[var(--blue)] bg-[rgba(52,152,219,0.1)] cursor-default'
                      : isAvailable
                        ? 'border-[var(--green)] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] hover:shadow-md cursor-pointer border-dashed'
                        : room.status === 'MAINTENANCE'
                          ? 'border-[var(--red)] bg-[rgba(231,76,60,0.08)] cursor-not-allowed opacity-60'
                          : 'border-[var(--border)] bg-[var(--bg-card)] cursor-not-allowed opacity-50'
                  }`}
                  style={{ minHeight: `${ROOM_CARD_HEIGHT}px` }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">{room.roomNumber}</span>
                    <span className={`w-2 h-2 rounded-full ${
                      booking ? 'bg-[var(--blue)]' :
                      room.status === 'AVAILABLE' ? 'bg-[var(--green)]' :
                      room.status === 'DIRTY' ? 'bg-[var(--yellow)]' :
                      room.status === 'MAINTENANCE' ? 'bg-[var(--red)]' : 'bg-gray-400'
                    }`} />
                  </div>
                  {booking ? (
                    <div className="text-xs text-[var(--blue)] truncate">
                      <span className="font-semibold">{booking.guestName || booking.bookingNo}</span>
                      <span className="text-[var(--text-muted)] block text-[10px]">
                        خروج: {new Date(booking.checkOut).toLocaleDateString('ar-LY')}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">
                      {room.status === 'AVAILABLE' ? '🟢 متاحة' :
                       room.status === 'DIRTY' ? '🟡 غير نظيفة' :
                       room.status === 'MAINTENANCE' ? '🔴 صيانة' : 'مشغول'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
