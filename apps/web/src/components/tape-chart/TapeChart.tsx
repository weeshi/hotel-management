'use client';

import { useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui';
import { useTapeChartDrag } from './useTapeChartDrag';
import type { TapeChartRoom, TapeChartBooking, TapeChartData } from './types';

const DAY_WIDTH = 44;
const ROW_HEIGHT = 56;
const ROOM_COL_WIDTH = 130;
const HEADER_HEIGHT = 48;

function formatDate(d: Date): string {
  const days = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  return `${days[d.getDay()]}\n${d.getDate()}`;
}

function isToday(d: Date): boolean {
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 5 || day === 6;
}

function getBookingStyle(booking: TapeChartBooking, dateColumns: Date[]) {
  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);

  const startCol = dateColumns.findIndex(d => d.toDateString() === checkIn.toDateString());
  const endCol = dateColumns.findIndex(d => d.toDateString() === checkOut.toDateString());

  if (startCol === -1 || endCol === -1) return null;

  const left = startCol * DAY_WIDTH;
  const width = (endCol - startCol) * DAY_WIDTH;

  return { left: `${left}px`, width: `${width}px`, top: '2px', height: `${ROW_HEIGHT - 4}px` };
}

function getBookingColor(status: string): string {
  switch (status) {
    case 'CHECKED_IN': return 'bg-[rgba(46,204,113,0.25)] border-[var(--green)] text-[var(--green)]';
    case 'CONFIRMED': return 'bg-[rgba(52,152,219,0.2)] border-[var(--blue)] text-[var(--blue)]';
    default: return 'bg-[rgba(201,168,76,0.15)] border-[var(--gold)] text-[var(--gold)]';
  }
}

interface TapeChartProps {
  data: TapeChartData;
  dateColumns: Date[];
  onRefresh: () => void;
}

export function TapeChart({ data, dateColumns, onRefresh }: TapeChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleMoveRoom = useCallback(async (bookingId: string, targetRoomId: string) => {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/move-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ targetRoomId }),
      });
      const json = await res.json();
      if (json.success) { onRefresh(); return true; }
      return false;
    } catch { return false; }
  }, [onRefresh]);

  const handleExtend = useCallback(async (bookingId: string, newCheckOut: string) => {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ newCheckOut }),
      });
      const json = await res.json();
      if (json.success) { onRefresh(); return true; }
      return false;
    } catch { return false; }
  }, [onRefresh]);

  const {
    dragBooking,
    dragType,
    dropTarget,
    processing,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useTapeChartDrag({ onMoveRoom: handleMoveRoom, onExtend: handleExtend, dateColumns });

  const totalWidth = ROOM_COL_WIDTH + dateColumns.length * DAY_WIDTH;
  const totalHeight = HEADER_HEIGHT + data.rooms.length * ROW_HEIGHT;

  const roomGroups = useMemo(() => {
    const groups: { floor: number; rooms: TapeChartRoom[] }[] = [];
    for (const room of data.rooms) {
      const floor = room.floor ?? 0;
      let group = groups.find(g => g.floor === floor);
      if (!group) {
        group = { floor, rooms: [] };
        groups.push(group);
      }
      group.rooms.push(room);
    }
    return groups.sort((a, b) => a.floor - b.floor);
  }, [data.rooms]);

  const flatRooms = useMemo(() => {
    const rooms: TapeChartRoom[] = [];
    for (const group of roomGroups) {
      rooms.push(...group.rooms);
    }
    return rooms;
  }, [roomGroups]);

  function getRoomIndex(roomId: string): number {
    return flatRooms.findIndex(r => r.id === roomId);
  }

  return (
    <div className="overflow-auto border border-[var(--border)] rounded-xl bg-[var(--bg-card)]" ref={chartRef}>
      <div style={{ minWidth: `${totalWidth}px`, position: 'relative' }}>

        {/* Header */}
        <div className="flex" style={{ height: `${HEADER_HEIGHT}px` }}>
          <div
            className="sticky right-0 z-10 flex items-center px-3 font-bold text-sm border-b border-l border-[var(--border)] bg-[var(--bg-secondary)]"
            style={{ width: `${ROOM_COL_WIDTH}px`, minWidth: `${ROOM_COL_WIDTH}px` }}
          >
            الغرفة
          </div>
          {dateColumns.map((d, i) => (
            <div
              key={i}
              className={`flex items-center justify-center text-xs font-medium border-b border-l border-[var(--border)] ${
                isToday(d) ? 'bg-[rgba(201,168,76,0.12)] text-[var(--gold)]' : isWeekend(d) ? 'bg-[var(--bg-secondary)]' : ''
              }`}
              style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
            >
              <div className="text-center leading-tight whitespace-pre">
                {formatDate(d)}
              </div>
            </div>
          ))}
        </div>

        {/* Room Rows */}
        <div style={{ position: 'relative' }}>
          {roomGroups.map((group) => (
            <div key={group.floor}>
              {/* Floor header */}
              <div
                className="flex items-center px-3 text-xs font-bold text-[var(--text-muted)] bg-[var(--bg-secondary)] border-b border-[var(--border)]"
                style={{ height: '28px' }}
              >
                <div style={{ width: `${ROOM_COL_WIDTH}px`, minWidth: `${ROOM_COL_WIDTH}px` }}>
                  الطابق {group.floor}
                </div>
                <div style={{ width: `${dateColumns.length * DAY_WIDTH}px` }} />
              </div>

              {group.rooms.map((room, ri) => {
                const globalIndex = flatRooms.indexOf(room);
                const roomBookings = data.bookingRooms.filter(b => b.roomId === room.id);

                return (
                  <div key={room.id} className="flex border-b border-[var(--border)]" style={{ height: `${ROW_HEIGHT}px` }}>
                    {/* Room info cell */}
                    <div
                      className="sticky right-0 z-10 flex items-center gap-2 px-3 border-l border-[var(--border)] bg-[var(--bg-card)]"
                      style={{ width: `${ROOM_COL_WIDTH}px`, minWidth: `${ROOM_COL_WIDTH}px` }}
                    >
                      <span className="font-bold text-sm">{room.roomNumber}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{room.roomType.name}</span>
                      <span className={`w-2 h-2 rounded-full ${
                        room.status === 'AVAILABLE' ? 'bg-[var(--green)]' :
                        room.status === 'OCCUPIED' ? 'bg-[var(--blue)]' :
                        room.status === 'DIRTY' ? 'bg-[var(--yellow)]' :
                        room.status === 'MAINTENANCE' ? 'bg-[var(--red)]' : 'bg-gray-400'
                      }`} />
                    </div>

                    {/* Day cells for this room */}
                    <div className="flex flex-1 relative">
                      {dateColumns.map((d, ci) => (
                        <div
                          key={ci}
                          className={`border-l border-b border-[var(--border)] ${
                            dropTarget?.roomIndex === globalIndex && dropTarget?.colIndex === ci
                              ? 'bg-[rgba(201,168,76,0.15)]'
                              : isWeekend(d) ? 'bg-[var(--bg-secondary)]' : ''
                          }`}
                          style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                          onDragOver={e => handleDragOver(e, globalIndex, ci)}
                          onDragLeave={handleDragLeave}
                          onDrop={e => handleDrop(e, room.id)}
                        />
                      ))}

                      {/* Booking bars */}
                      {roomBookings.map(b => {
                        const style = getBookingStyle(b, dateColumns);
                        if (!style) return null;

                        return (
                          <div
                            key={b.id}
                            draggable={!processing}
                            onDragStart={() => handleDragStart(b, 'move')}
                            onDragEnd={handleDragEnd}
                            className={`absolute rounded-lg border border-r-0 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-lg ${getBookingColor(b.status)} ${
                              dragBooking?.id === b.id && dragType === 'move' ? 'opacity-50 scale-95' : ''
                            }`}
                            style={{
                              ...style,
                              left: `${parseInt(String(style.left)) + 2}px`,
                              width: `calc(${style.width} - 4px)`,
                              zIndex: 10,
                            }}
                          >
                            <div className="flex items-center justify-between px-2 h-full text-[11px] leading-tight">
                              <span className="truncate font-semibold max-w-[80px]">
                                {b.guestName || b.bookingNo}
                              </span>
                              <span className="text-[10px] opacity-75">
                                {b.folioBalance > 0 ? `${b.folioBalance} ` : ''}
                              </span>
                            </div>

                            {/* Resize handle for extending stay */}
                            <div
                              draggable={!processing}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                handleDragStart(b, 'extend');
                              }}
                              onDragEnd={handleDragEnd}
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 rounded-r"
                              style={{ left: 'auto', right: '-4px', zIndex: 20 }}
                              title="اسحب لتمديد الإقامة"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Processing overlay */}
        {processing && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded-xl z-50">
            <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

      </div>
    </div>
  );
}
