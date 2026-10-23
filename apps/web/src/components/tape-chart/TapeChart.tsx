'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-client';
import { AssignRoomModal } from '@/components/bookings/AssignRoomModal';
import { useTapeChartDrag } from './useTapeChartDrag';
import type {
  TapeChartRoom,
  TapeChartBooking,
  TapeChartData,
  TapeChartFilters,
  TapeChartUnassignedBooking,
} from './types';

const DAY_WIDTH = 44;
const ROW_HEIGHT = 56;
const ROOM_COL_WIDTH = 130;
const HEADER_HEIGHT = 48;

const EMPTY_FILTERS: TapeChartFilters = { q: '', roomTypeId: '', floor: '', status: '' };

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'بانتظار التأكيد' },
  { value: 'CONFIRMED', label: 'مؤكد' },
  { value: 'CHECKED_IN', label: 'مقيم' },
  { value: 'AVAILABLE', label: 'غرفة متاحة' },
  { value: 'OCCUPIED', label: 'غرفة مشغولة' },
  { value: 'DIRTY', label: 'غير نظيفة' },
  { value: 'MAINTENANCE', label: 'صيانة' },
];

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

function normalizeDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-LY', { day: '2-digit', month: '2-digit' });
}

function getBookingStyle(booking: TapeChartBooking, dateColumns: Date[]) {
  const checkIn = normalizeDate(new Date(booking.checkIn));
  const checkOut = normalizeDate(new Date(booking.checkOut));

  const startCol = dateColumns.findIndex(d => normalizeDate(d).getTime() === checkIn.getTime());
  if (startCol === -1) return null;

  const endCol = dateColumns.findIndex(d => normalizeDate(d).getTime() >= checkOut.getTime());
  const effectiveEndCol = endCol === -1 ? dateColumns.length : endCol;

  const left = startCol * DAY_WIDTH;
  const width = Math.max(DAY_WIDTH, (effectiveEndCol - startCol) * DAY_WIDTH);

  return { left: `${left}px`, width: `${width}px`, top: '2px', height: `${ROW_HEIGHT - 4}px` };
}

function getBookingColor(status: string): string {
  switch (status) {
    case 'CHECKED_IN': return 'bg-[rgba(46,204,113,0.25)] border-[var(--green)] text-[var(--green)]';
    case 'CONFIRMED': return 'bg-[rgba(52,152,219,0.2)] border-[var(--blue)] text-[var(--blue)]';
    default: return 'bg-[rgba(201,168,76,0.15)] border-[var(--gold)] text-[var(--gold)]';
  }
}

function getLaneStatusColor(status: string): string {
  switch (status) {
    case 'CONFIRMED': return 'border-[var(--blue)] text-[var(--blue)]';
    case 'PENDING': return 'border-[var(--gold)] text-[var(--gold)]';
    default: return 'border-[var(--border)] text-[var(--text-secondary)]';
  }
}

interface TapeChartProps {
  data: TapeChartData;
  dateColumns: Date[];
  onRefresh: () => void;
  filters?: TapeChartFilters;
  onFiltersChange?: (filters: TapeChartFilters) => void;
}

export function TapeChart({ data, dateColumns, onRefresh, filters, onFiltersChange }: TapeChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const laneDragRef = useRef<TapeChartUnassignedBooking | null>(null);

  const [assignTarget, setAssignTarget] = useState<TapeChartUnassignedBooking | null>(null);
  const [laneDrag, setLaneDrag] = useState<TapeChartUnassignedBooking | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const activeFilters = filters ?? EMPTY_FILTERS;
  const unassigned = data.unassignedBookings ?? [];
  const filterOptions = data.filterOptions ?? { roomTypes: [], floors: [] };

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

  const updateFilter = useCallback((key: keyof TapeChartFilters, value: string) => {
    onFiltersChange?.({ ...activeFilters, [key]: value });
  }, [activeFilters, onFiltersChange]);

  const assignRoomToTarget = useCallback(async (item: TapeChartUnassignedBooking, roomId: string) => {
    setIsAssigning(true);
    setAssignError(null);
    const response = await apiPost(`/api/admin/bookings/${item.bookingId}/assign-room`, {
      bookingRoomId: item.bookingRoomId,
      roomId,
    });
    setIsAssigning(false);
    if (response.success) {
      laneDragRef.current = null;
      setLaneDrag(null);
      setAssignTarget(null);
      onRefresh();
    } else {
      setAssignError(response.error.message);
    }
  }, [onRefresh]);

  const handleLaneDragStart = useCallback((event: React.DragEvent, item: TapeChartUnassignedBooking) => {
    event.dataTransfer.setData('text/plain', item.bookingRoomId);
    event.dataTransfer.effectAllowed = 'move';
    laneDragRef.current = item;
    setLaneDrag(item);
    setAssignError(null);
  }, []);

  const handleLaneDragEnd = useCallback(() => {
    laneDragRef.current = null;
    setLaneDrag(null);
  }, []);

  const handleCellDrop = useCallback(async (event: React.DragEvent, targetRoomId: string) => {
    const laneItem = laneDragRef.current;
    if (!laneItem) {
      await handleDrop(event, targetRoomId);
      return;
    }
    event.preventDefault();
    await assignRoomToTarget(laneItem, targetRoomId);
  }, [assignRoomToTarget, handleDrop]);

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

  const roomTypeOptions = useMemo(
    () => filterOptions.roomTypes.map(rt => ({ value: rt.id, label: rt.nameAr || rt.name })),
    [filterOptions.roomTypes],
  );

  const floorOptions = useMemo(
    () => filterOptions.floors.map(floor => ({ value: String(floor), label: `الطابق ${floor}` })),
    [filterOptions.floors],
  );

  function getRoomIndex(roomId: string): number {
    return flatRooms.findIndex(r => r.id === roomId);
  }

  return (
    <div data-component="TapeChart" data-print-root className="space-y-3">
      {/* Filter controls */}
      <div data-print-hide className="flex flex-wrap items-end gap-2">
        <Input
          value={activeFilters.q}
          onChange={e => updateFilter('q', e.target.value)}
          placeholder="بحث بالاسم أو رقم الحجز"
          aria-label="بحث في المخطط الزمني"
          className="w-56"
        />
        <Select
          value={activeFilters.roomTypeId}
          onChange={e => updateFilter('roomTypeId', e.target.value)}
          options={roomTypeOptions}
          placeholder="كل أنواع الغرف"
          aria-label="نوع الغرفة"
          className="w-44"
        />
        <Select
          value={activeFilters.floor}
          onChange={e => updateFilter('floor', e.target.value)}
          options={floorOptions}
          placeholder="كل الطوابق"
          aria-label="الطابق"
          className="w-36"
        />
        <Select
          value={activeFilters.status}
          onChange={e => updateFilter('status', e.target.value)}
          options={STATUS_OPTIONS}
          placeholder="كل الحالات"
          aria-label="الحالة"
          className="w-40"
        />
        <Button variant="secondary" onClick={() => window.print()}>
          🖨️ طباعة
        </Button>
      </div>

      {/* Unassigned bookings lane */}
      <div data-print-hide className="rounded-xl border border-dashed border-[var(--gold)] bg-[rgba(201,168,76,0.06)] p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[var(--gold)]">
            قائمة الحجوزات بانتظار التخصيص ({unassigned.length})
          </h3>
          <span className="text-[10px] text-[var(--text-muted)]">
            انقر التخصيص أو اسحب الحجز إلى غرفة في المخطط
          </span>
        </div>

        {unassigned.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">لا توجد حجوزات بانتظار التخصيص.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {unassigned.map(item => (
              <button
                key={item.bookingRoomId}
                type="button"
                draggable
                onDragStart={event => handleLaneDragStart(event, item)}
                onDragEnd={handleLaneDragEnd}
                onClick={() => setAssignTarget(item)}
                title="تخصيص غرفة"
                className={`shrink-0 rounded-lg border bg-[var(--bg-card)] px-3 py-2 text-right text-xs transition hover:shadow-md ${getLaneStatusColor(item.status)} ${
                  laneDrag?.bookingRoomId === item.bookingRoomId ? 'opacity-50' : ''
                }`}
              >
                <span className="block font-semibold">{item.guestName || item.bookingNo}</span>
                <span className="block text-[10px] text-[var(--text-muted)]">
                  {item.bookingNo} · {item.roomTypeName || 'نوع غير محدد'}
                </span>
                <span className="block text-[10px] text-[var(--text-muted)]">
                  {formatShortDate(item.checkIn)} → {formatShortDate(item.checkOut)} · {item.source}
                </span>
              </button>
            ))}
          </div>
        )}

        {assignError && <p className="mt-2 text-xs text-[var(--red)]">{assignError}</p>}
      </div>

      {/* Grid */}
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

                {group.rooms.map((room) => {
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
                            onDrop={e => { void handleCellDrop(e, room.id); }}
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
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', b.id);
                                e.dataTransfer.effectAllowed = 'move';
                                handleDragStart(b, 'move');
                              }}
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
                                  e.dataTransfer.setData('text/plain', b.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  handleDragStart(b, 'extend');
                                }}
                                onDragEnd={handleDragEnd}
                                className="absolute top-0 bottom-0 w-3 cursor-col-resize hover:bg-white/20 rounded"
                                style={{ left: 'auto', right: '-6px', zIndex: 20 }}
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
          {(processing || isAssigning) && (
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded-xl z-50">
              <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

        </div>
      </div>

      {/* Assignment modal (click-to-assign) */}
      {assignTarget && (
        <AssignRoomModal
          open
          onClose={() => setAssignTarget(null)}
          bookingId={assignTarget.bookingId}
          bookingRoomId={assignTarget.bookingRoomId}
          roomTypeId={assignTarget.roomTypeId}
          roomTypeName={assignTarget.roomTypeName ?? undefined}
          checkIn={assignTarget.checkIn}
          checkOut={assignTarget.checkOut}
          onAssigned={() => { setAssignTarget(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
