'use client';

import { Input } from '@/components/ui';

interface Props {
  checkIn: string;
  checkOut: string;
  nights: number;
  onCheckInChange: (val: string) => void;
  onCheckOutChange: (val: string) => void;
}

export function DateRangeCard({ checkIn, checkOut, nights, onCheckInChange, onCheckOutChange }: Props) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="font-bold text-sm mb-4">📅 تواريخ الإقامة</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="تاريخ الوصول" type="date" value={checkIn} onChange={(e) => onCheckInChange(e.target.value)} />
        <Input label="تاريخ المغادرة" type="date" value={checkOut} onChange={(e) => onCheckOutChange(e.target.value)} />
      </div>
      {nights > 0 && (
        <p className="text-sm text-[var(--text-secondary)] mt-2">{nights} ليلة</p>
      )}
    </div>
  );
}
