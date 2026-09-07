'use client';

import { clsx } from 'clsx';
import type { AvailableRoom } from '@/lib/types/public-booking';

interface RoomSelectorProps {
  rooms: AvailableRoom[];
  selectedRoomTypeId: string;
  onSelect: (room: AvailableRoom) => void;
  nights: number;
}

export function RoomSelector({ rooms, selectedRoomTypeId, onSelect, nights }: RoomSelectorProps) {
  if (rooms.length === 0) {
    return (
      <div className="py-10 text-center text-[var(--text-muted)]">
        لا توجد غرف متاحة للفترة المحددة
      </div>
    );
  }

  return (
    <div data-component="RoomSelector" className="space-y-3">
      {rooms.map((room) => {
        const selected = room.roomType.id === selectedRoomTypeId;
        return (
          <button
            key={room.roomType.id}
            type="button"
            onClick={() => onSelect(room)}
            className={clsx(
              'w-full text-right rounded-xl border p-4 transition-all',
              selected
                ? 'border-[var(--gold)] bg-[rgba(201,168,76,0.08)]'
                : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-gold)]'
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-[var(--text-primary)]">
                    {room.roomType.nameAr || room.roomType.name}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(201,168,76,0.15)] text-[var(--gold)]">
                    متاح {room.availableCount}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  {room.roomType.description || ''}
                  {room.roomType.capacity > 0 && ` — تتسع لـ ${room.roomType.capacity} أشخاص`}
                </p>
                {room.cancellationPolicy && (
                  <p className="text-xs text-[var(--text-muted)]">
                    سياسة الإلغاء: {room.cancellationPolicy.nameAr || room.cancellationPolicy.name}
                  </p>
                )}
              </div>
              <div className="text-left shrink-0">
                <div className="text-xl font-bold text-[var(--gold)]">
                  {room.nightlyRate} <span className="text-sm">د.ل/ليلة</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">{nights} ليالٍ</div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="text-[var(--text-muted)]">
                الإجمالي
                <div className="text-sm font-bold text-[var(--text-primary)]">{room.pricing.subtotal} د.ل</div>
              </div>
              {room.pricing.discountAmount > 0 && (
                <div className="text-[var(--text-muted)]">
                  الخصم ({room.pricing.discountPercent}%)
                  <div className="text-sm font-bold text-[var(--red)]">-{room.pricing.discountAmount} د.ل</div>
                </div>
              )}
              <div className="text-[var(--text-muted)]">
                الضريبة ({room.pricing.taxRate}%)
                <div className="text-sm font-bold text-[var(--text-primary)]">+{room.pricing.taxAmount} د.ل</div>
              </div>
              {room.pricing.bookingFee > 0 && (
                <div className="text-[var(--text-muted)]">
                  رسوم الحجز
                  <div className="text-sm font-bold text-[var(--text-primary)]">+{room.pricing.bookingFee} د.ل</div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] px-4 py-2.5">
              <span className="text-sm text-[var(--text-secondary)]">المبلغ النهائي</span>
              <span className="text-lg font-extrabold text-[var(--gold)]">{room.pricing.totalAmount} د.ل</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
