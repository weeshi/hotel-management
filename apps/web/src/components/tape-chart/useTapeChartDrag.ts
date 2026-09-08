'use client';

import { useState, useCallback, useRef } from 'react';
import type { TapeChartBooking, DropResult } from './types';

interface UseTapeChartDragOptions {
  onMoveRoom: (bookingId: string, targetRoomId: string) => Promise<boolean>;
  onExtend: (bookingId: string, newCheckOut: string) => Promise<boolean>;
  dateColumns: Date[];
}

export function useTapeChartDrag({ onMoveRoom, onExtend, dateColumns }: UseTapeChartDragOptions) {
  const [dragBooking, setDragBooking] = useState<TapeChartBooking | null>(null);
  const [dragType, setDragType] = useState<'move' | 'extend' | null>(null);
  const [dropTarget, setDropTarget] = useState<{ roomIndex: number; colIndex: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const dragRef = useRef<{
    booking: TapeChartBooking;
    sourceRoomId: string;
    type: 'move' | 'extend';
    startCol: number;
  } | null>(null);

  const handleDragStart = useCallback((booking: TapeChartBooking, type: 'move' | 'extend') => {
    dragRef.current = {
      booking,
      sourceRoomId: booking.roomId,
      type,
      startCol: dateColumns.findIndex(
        d => d.toDateString() === new Date(booking.checkIn).toDateString()
      ),
    };
    setDragBooking(booking);
    setDragType(type);
  }, [dateColumns]);

  const handleDragOver = useCallback((e: React.DragEvent, roomIndex: number, colIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ roomIndex, colIndex });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetRoomId: string): Promise<DropResult | null> => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag) return null;

    setProcessing(true);

    try {
      if (drag.type === 'move' && targetRoomId !== drag.sourceRoomId) {
        await onMoveRoom(drag.booking.bookingId, targetRoomId);
        return {
          action: 'move-room',
          bookingId: drag.booking.bookingId,
          targetRoomId,
        };
      }

      if (drag.type === 'extend' && dropTarget) {
        const newCheckOut = new Date(dateColumns[dropTarget.colIndex + 1]);
        newCheckOut.setHours(12, 0, 0, 0);
        const newCheckOutStr = newCheckOut.toISOString();

        if (newCheckOut > new Date(drag.booking.checkOut)) {
          await onExtend(drag.booking.bookingId, newCheckOutStr);
          return {
            action: 'extend',
            bookingId: drag.booking.bookingId,
            newCheckOut: newCheckOutStr,
          };
        }
      }

      return null;
    } finally {
      setDragBooking(null);
      setDragType(null);
      setDropTarget(null);
      dragRef.current = null;
      setProcessing(false);
    }
  }, [dropTarget, dateColumns, onMoveRoom, onExtend]);

  const handleDragEnd = useCallback(() => {
    setDragBooking(null);
    setDragType(null);
    setDropTarget(null);
    dragRef.current = null;
  }, []);

  return {
    dragBooking,
    dragType,
    dropTarget,
    processing,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
