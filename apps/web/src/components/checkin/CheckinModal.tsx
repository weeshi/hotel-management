'use client';

import { Modal, Button } from '@/components/ui';
import type { Booking } from './types';

interface Props {
  open: boolean;
  booking: Booking | null;
  onConfirm: (bookingId: string) => void;
  onClose: () => void;
}

export function CheckinModal({ open, booking, onConfirm, onClose }: Props) {
  if (!booking) return null;

  return (
    <Modal open={open} onClose={onClose} title="🔑 تأكيد تسجيل الدخول">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">هل أنت متأكد من تسجيل دخول هذا النزيل؟</p>
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>النزيل:</strong> {booking.guestName || booking.guest?.name || 'غير محدد'}</div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => onConfirm(booking.id)}>🔑 تأكيد الدخول</Button>
        </div>
      </div>
    </Modal>
  );
}
