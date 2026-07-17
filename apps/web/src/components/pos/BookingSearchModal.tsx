'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import type { Booking } from './types';

interface Props {
  open: boolean;
  bookings: Booking[];
  onSearch: (query: string) => void;
  onSelect: (booking: Booking) => void;
  onClose: () => void;
}

export function BookingSearchModal({ open, bookings, onSearch, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');

  return (
    <Modal open={open} onClose={onClose} title="ربط بالفاتورة">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="رقم الحجز أو اسم النزيل" />
          <Button variant="secondary" onClick={() => onSearch(query)}>بحث</Button>
        </div>
        <div className="max-h-60 overflow-y-auto space-y-2">
          {bookings.map(b => (
            <div key={b.id}
              onClick={() => { onSelect(b); onClose(); }}
              className="p-3 bg-[var(--bg-primary)] rounded-lg cursor-pointer hover:border-[var(--gold)] border border-[var(--border)]">
              <div className="text-sm font-semibold">{b.guestName}</div>
              <div className="text-xs text-[var(--text-muted)]">{b.bookingNo}</div>
            </div>
          ))}
          {bookings.length === 0 && <div className="text-xs text-[var(--text-muted)] text-center">لا توجد نتائج</div>}
        </div>
      </div>
    </Modal>
  );
}
