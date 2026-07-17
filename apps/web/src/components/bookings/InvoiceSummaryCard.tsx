'use client';

import type { Room } from './types';

interface Props {
  rooms: Room[];
  selectedRooms: Record<string, number>;
  nights: number;
  totalCharges: number;
}

export function InvoiceSummaryCard({ rooms, selectedRooms, nights, totalCharges }: Props) {
  if (nights <= 0 || totalCharges <= 0) return null;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="font-bold text-sm mb-4">💰 ملخص الفاتورة</h3>
      <div className="space-y-2 text-sm">
        {Object.entries(selectedRooms).map(([roomId, rate]) => {
          const room = rooms.find((r) => r.id === roomId);
          return (
            <div key={roomId} className="flex justify-between">
              <span>{room?.roomNumber || roomId}</span>
              <span>{rate} د.ل × {nights} ليلة = {rate * nights} د.ل</span>
            </div>
          );
        })}
        <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold text-base">
          <span>الإجمالي</span>
          <span className="text-[var(--gold)]">{totalCharges} د.ل</span>
        </div>
      </div>
    </div>
  );
}
