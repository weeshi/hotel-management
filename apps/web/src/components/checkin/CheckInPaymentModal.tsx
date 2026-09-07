'use client';

import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { showErrorModal } from '@/components/ui/error-modal';
import type { Booking } from './types';

interface Props {
  open: boolean;
  booking: Booking | null;
  onConfirm: (bookingId: string, payment?: { method: string; amount: number }) => Promise<void>;
  onSkipPayment: (bookingId: string) => Promise<void>;
  onClose: () => void;
}

function calculateRoomCharges(booking: Booking): number {
  let total = 0;
  for (const room of booking.rooms || []) {
    const rate = room.nightlyRate ?? 0;
    if (!room.checkIn || !room.checkOut || rate <= 0) continue;
    const nights = Math.max(1, Math.round(
      (new Date(room.checkOut).getTime() - new Date(room.checkIn).getTime()) / 86400000
    ));
    total += rate * nights;
  }
  return total;
}

function calculateServiceCharges(booking: Booking): number {
  return (booking.bookingServices || []).reduce((sum, bs) => sum + (bs.price || 0), 0);
}

export function CheckInPaymentModal({ open, booking, onConfirm, onSkipPayment, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);

  const roomCharges = booking ? calculateRoomCharges(booking) : 0;
  const serviceCharges = booking ? calculateServiceCharges(booking) : 0;
  const upfrontTotal = roomCharges + serviceCharges;

  useEffect(() => {
    if (open && upfrontTotal > 0) {
      setAmount(String(upfrontTotal));
    }
  }, [open, upfrontTotal]);

  if (!booking) return null;

  const guestName = booking.guestName || booking.guest?.name || 'غير محدد';
  const roomNumbers = booking.rooms?.map(r => r.room.roomNumber).join('، ') || '';

  async function handlePayWithAmount() {
    if (!booking) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      showErrorModal('أدخل مبلغ صحيح');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(booking.id, { method, amount: parsed });
    } catch (err: any) {
      showErrorModal(err?.message || 'فشل تسجيل الدخول');
      setSubmitting(false);
    }
  }

  async function handleSkipPayment() {
    if (!booking) return;
    setSubmitting(true);
    try {
      await onSkipPayment(booking.id);
    } catch (err: any) {
      showErrorModal(err?.message || 'فشل تسجيل الدخول');
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="🔑 تسجيل الدخول — تحصيل المبلغ المقدّم" size="lg">
      <div className="space-y-5">
        <div className="text-sm bg-[var(--bg-primary)] rounded-lg p-4 space-y-1">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>النزيل:</strong> {guestName}</div>
          <div><strong>الغرفة:</strong> {roomNumbers}</div>
        </div>

        <div className="border border-[var(--border)] rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[var(--text-secondary)]">رسوم الإقامة</span>
            <span className="text-sm font-medium">{roomCharges.toFixed(2)} د.ل</span>
          </div>
          {serviceCharges > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--text-secondary)]">الخدمات المطلوبة</span>
              <span className="text-sm font-medium">{serviceCharges.toFixed(2)} د.ل</span>
            </div>
          )}
          {(booking.bookingServices || []).map(bs => (
            <div key={bs.id} className="flex justify-between items-center pl-4">
              <span className="text-xs text-[var(--text-muted)]">↳ {bs.service.nameAr || bs.service.name} ×{bs.quantity}</span>
              <span className="text-xs text-[var(--text-muted)]">{bs.price.toFixed(2)} د.ل</span>
            </div>
          ))}
          <div className="border-t border-[var(--border)] pt-2 flex justify-between items-center">
            <span className="text-sm font-medium">المبلغ المطلوب مسبقاً</span>
            <span className="text-lg font-bold text-[var(--gold)]">{upfrontTotal.toFixed(2)} د.ل</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">المبلغ (د.ل)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">طريقة الدفع</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]">
              <option value="CASH">💰 نقداً</option>
              <option value="CARD">💳 بطاقة</option>
              <option value="MOBICASH">📱 موبي كاش</option>
              <option value="SADAD">📲 سداد</option>
              <option value="TADAWUL">📲 تدوال</option>
              <option value="BANK_TRANSFER">🏦 تحويل بنكي</option>
              <option value="WALLET">👛 المحفظة</option>
              <option value="POS">🏧 نقاط بيع</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-between pt-2 border-t border-[var(--border)]">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>إلغاء</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSkipPayment} disabled={submitting}>
              🏢 تخطي الدفع (حساب شركة)
            </Button>
            <Button onClick={handlePayWithAmount} loading={submitting}>
              💳 تحصيل وتسجيل الدخول
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
