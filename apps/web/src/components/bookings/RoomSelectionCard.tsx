'use client';

import { EmptyState } from '@/components/ui';
import type { Room, RatePlanOption } from './types';

interface Props {
  rooms: Room[];
  selectedRooms: Record<string, number>;
  ratePlans: Record<string, RatePlanOption[]>;
  onToggleRoom: (roomId: string) => void;
  onRateChange: (roomId: string, rate: number) => void;
}

export function RoomSelectionCard({ rooms, selectedRooms, ratePlans, onToggleRoom, onRateChange }: Props) {
  const availableRooms = rooms.filter((r) => r.status === 'AVAILABLE');

  if (availableRooms.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="font-bold text-sm mb-4">🛏️ اختيار الغرف</h3>
        <EmptyState icon="🛏️" title="لا توجد غرف متاحة" description="جميع الغرف محجوزة حالياً" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="font-bold text-sm mb-4">🛏️ اختيار الغرف</h3>
      <div className="space-y-3">
        {availableRooms.map((room) => {
          const isSelected = room.id in selectedRooms;
          const plans = ratePlans[room.roomType.id] || [];

          return (
            <div
              key={room.id}
              className={`rounded-xl border transition ${
                isSelected
                  ? 'border-[var(--gold)] bg-[var(--gold)]/5'
                  : 'border-[var(--border)]'
              }`}
            >
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => onToggleRoom(room.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'border-[var(--gold)] bg-[var(--gold)]' : 'border-[var(--text-secondary)]'
                  }`}>
                    {isSelected && <span className="text-black text-xs font-bold">✓</span>}
                  </div>
                  <div>
                    <p className="font-medium">{room.roomNumber}
                      <span className="text-sm text-[var(--text-secondary)] mr-2">
                        {room.roomType.nameAr || room.roomType.name} — الطابق {room.floor}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">استيعاب {room.roomType.capacity} أشخاص</p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    className="w-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-center [appearance:textfield]"
                    value={selectedRooms[room.id] || room.roomType.baseRate}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val > 0) onRateChange(room.id, val);
                    }}
                    min={1}
                  />
                  <span className="text-sm text-[var(--text-secondary)]">د.ل/ليلة</span>
                </div>
              </div>

              {isSelected && plans.length > 0 && (
                <div className="px-4 pb-4 pt-0 border-t border-[var(--border)]/50 mt-0">
                  <p className="text-xs text-[var(--text-muted)] mb-2 mt-2">خطط الأسعار المتاحة:</p>
                  <div className="flex flex-wrap gap-2">
                    {plans.map((plan) => (
                      <button
                        key={plan.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRateChange(room.id, plan.nightlyRate);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          selectedRooms[room.id] === plan.nightlyRate
                            ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]/50'
                        }`}
                      >
                        {plan.nameAr || plan.name} — {plan.nightlyRate} د.ل
                        {plan.cancellationPolicyName && (
                          <span className="block text-[10px] opacity-70">{plan.cancellationPolicyName}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
