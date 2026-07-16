'use client';

import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import type { RestaurantOrder } from './types';

interface Props {
  open: boolean;
  order: RestaurantOrder | null;
  onClose: () => void;
  onSettle: (orderId: string, method: 'WALLET' | 'CASH' | 'POS') => Promise<void>;
}

const METHODS = [
  { value: 'CASH' as const, label: 'نقداً', icon: '💰' },
  { value: 'POS' as const, label: 'بطاقة', icon: '💳' },
  { value: 'WALLET' as const, label: 'محفظة', icon: '👛' },
];

export function SettlementModal({ open, order, onClose, onSettle }: Props) {
  const [method, setMethod] = useState<'WALLET' | 'CASH' | 'POS'>('CASH');
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState('');

  if (!order) return null;
  const ord = order;

  const isWalkIn = !ord.bookingId;
  const canSettle = !settling;

  async function handleSettle() {
    if (!canSettle) return;
    setSettling(true);
    setError('');
    try {
      await onSettle(ord.id, method);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشلت تسوية الطلب');
    } finally {
      setSettling(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`🧾 تسوية الطلب #${ord.orderNo}`} size="sm">
      <div data-component="SettlementModal" className="space-y-4">
        <div className="bg-[var(--bg-primary)] p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">إجمالي الطلب</span>
            <span className="text-xl font-bold text-[var(--gold)]">{ord.totalAmount.toFixed(2)} د.ل</span>
          </div>
          {ord.booking && (
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {ord.booking.guestName} — #{ord.booking.bookingNo}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]">طريقة الدفع</label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(m => {
              const disabled = m.value === 'WALLET' && isWalkIn;
              return (
                <div key={m.value} className="relative group">
                  <button
                    type="button"
                    onClick={() => !disabled && setMethod(m.value)}
                    disabled={disabled || settling}
                    data-method={m.value}
                    className={`w-full p-3 rounded-xl border text-sm font-medium transition-all ${
                      method === m.value
                        ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]'
                        : disabled
                          ? 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] cursor-not-allowed opacity-50'
                          : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--gold)]'
                    }`}
                  >
                    <div className="text-lg mb-1">{m.icon}</div>
                    <div>{m.label}</div>
                  </button>
                  {disabled && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      متاح فقط لنزلاء الفندق
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {method === 'WALLET' && (
          <div className="text-xs text-[var(--blue)] bg-blue-500/10 p-2 rounded-lg">
            سيتم خصم المبلغ من محفظة النزيل الإلكترونية وإضافته إلى كشف حساب الغرفة.
          </div>
        )}

        {error && (
          <div className="text-xs text-[var(--red)] bg-red-500/10 p-2 rounded-lg">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={settling}>إلغاء</Button>
          <Button onClick={handleSettle} disabled={!canSettle || !method}>
            {settling ? 'جاري تسوية الطلب...' : `✅ تأكيد - ${METHODS.find(m => m.value === method)?.label}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
