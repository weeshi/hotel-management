'use client';

import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { useAuth } from '@/contexts/auth-context';
import type { Booking } from './types';

interface CancellationQuote {
  totalPaid: number;
  totalCharges: number;
  penaltyAmount: number;
  refundAmount: number;
  refundPercentage: number;
  canRefund: boolean;
  policyName: string | null;
  hasPolicy: boolean;
}

interface Props {
  open: boolean;
  booking: Booking | null;
  onConfirm: (bookingId: string, options?: { reason?: string; waivePenalty?: boolean; noShow?: boolean }) => void;
  onClose: () => void;
}

export function CancelModal({ open, booking, onConfirm, onClose }: Props) {
  const { user } = useAuth();
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [waivePenalty, setWaivePenalty] = useState(false);
  const [reason, setReason] = useState('');
  const [noShow, setNoShow] = useState(false);

  useEffect(() => {
    if (open && booking) {
      setLoading(true);
      setQuote(null);
      setWaivePenalty(false);
      setReason('');
      setNoShow(false);
      fetch(`/api/admin/bookings/${booking.id}/cancel`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setQuote(data.data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, booking]);

  if (!booking) return null;

  const canWaive = user && ['ADMIN', 'MANAGER'].includes(user.role);
  const effectivePenalty = waivePenalty ? 0 : (quote?.penaltyAmount || 0);
  const effectiveRefund = waivePenalty ? (quote?.totalPaid || 0) : (quote?.refundAmount || 0);

  return (
    <Modal open={open} onClose={onClose} title="❌ إلغاء الحجز" size="md">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>النزيل:</strong> {booking.guestName || booking.guest?.name || 'غير محدد'}</div>
          <div><strong>الحالة:</strong> {booking.status === 'CONFIRMED' ? 'مؤكد' : 'مقيم'}</div>
          {booking.status === 'CHECKED_IN' && (
            <label className="flex items-center gap-2 mt-2 text-xs">
              <input type="checkbox" checked={noShow} onChange={(e) => setNoShow(e.target.checked)} className="accent-[var(--red)]" />
              <span className="text-[var(--red)]">🚫 لا-show (لم يحضر)</span>
            </label>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-6 w-6 text-[var(--gold)]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : quote ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-sm space-y-2">
            <h3 className="font-bold text-[var(--gold)] mb-2">💰 عرض الإلغاء</h3>

            {quote.hasPolicy && (
              <div className="text-xs text-[var(--text-muted)] mb-2">السياسة: {quote.policyName}</div>
            )}

            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">إجمالي الرسوم</span>
              <span>{quote.totalCharges.toFixed(2)} د.ل</span>
            </div>
            <div className="flex justify-between text-[var(--green)]">
              <span>✅ المدفوع</span>
              <span>{quote.totalPaid.toFixed(2)} د.ل</span>
            </div>

            {!waivePenalty && quote.penaltyAmount > 0 && (
              <div className="flex justify-between text-[var(--red)]">
                <span>⚠️ غرامة الإلغاء ({quote.refundPercentage}%)</span>
                <span>-{quote.penaltyAmount.toFixed(2)} د.ل</span>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t border-[var(--border)] font-bold">
              <span>{effectiveRefund > 0 ? '💰 المبلغ المسترد' : '📋 المبلغ المستحق'}</span>
              <span className={effectiveRefund > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
                {effectiveRefund > 0 ? effectiveRefund.toFixed(2) : effectivePenalty.toFixed(2)} د.ل
              </span>
            </div>

            {!quote.hasPolicy && (
              <div className="text-xs text-[var(--text-muted)] mt-2">لا توجد سياسة إلغاء مطبقة</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-muted)] py-2">تعذر تحميل عرض الإلغاء</div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">سبب الإلغاء</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اختياري..."
            className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>

        {canWaive && quote && quote.penaltyAmount > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={waivePenalty} onChange={(e) => setWaivePenalty(e.target.checked)} className="accent-[var(--gold)]" />
            <span>👑 إعفاء من الغرامة (Admin/Manager)</span>
          </label>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>رجوع</Button>
          <Button variant="danger" onClick={() => onConfirm(booking.id, { reason, waivePenalty, noShow })}>
            {noShow ? '🚫 تأكيد No-Show' : '❌ تأكيد الإلغاء'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
