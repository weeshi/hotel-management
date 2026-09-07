'use client';

import { useState, useEffect } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { showErrorModal, dismissErrorModal } from '@/components/ui/error-modal';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import type { FolioSummary } from './types';

interface Props {
  open: boolean;
  folio: FolioSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RefundFolioModal({ open, folio, onClose, onSaved }: Props) {
  const [method, setMethod] = useState<'WALLET' | 'CASH'>('WALLET');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && folio) {
      setMethod('WALLET');
      setAmount(Math.abs(folio.balance).toFixed(2));
    }
  }, [open, folio]);

  if (!folio) return null;

  const maxRefund = Math.abs(folio.balance);
  const parsedAmount = parseFloat(amount);
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxRefund;
  const hasCashPayments = folio.payments?.some(
    (p: any) => p.method === 'CASH',
  );

  async function handleRefund() {
    if (!folio || !amountValid) return;
    setSaving(true);
    try {
      await getCsrfToken();
      const res = await fetch(`/api/admin/folios/${folio.folioId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ amount: parsedAmount, method }),
      });
      const data = await res.json();
      if (data.success) {
        dismissErrorModal();
        onSaved();
        onClose();
      } else {
        showErrorModal(data.error || 'فشل تسوية الرصيد الزائد');
      }
    } catch {
      showErrorModal('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="💰 تسوية الرصيد الزائد" size="sm">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg space-y-1">
          <div><strong>الحجز:</strong> #{folio.bookingNo}</div>
          <div><strong>النزيل:</strong> {folio.guest.name}</div>
          <div><strong>الرصيد الزائد:</strong>{' '}
            <span className="font-bold text-[var(--gold)]">{maxRefund.toFixed(2)} د.ل</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
            المبلغ المسترد
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            max={maxRefund}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          {amount && !amountValid && (
            <p className="text-xs text-red-500 mt-1">
              أدخل مبلغاً أكبر من 0 ولا يتجاوز {maxRefund.toFixed(2)} د.ل
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
            طريقة الاسترداد
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as 'WALLET' | 'CASH')}
            className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--gold)]"
          >
            <option value="WALLET">👛 ترحيل إلى محفظة النزيل</option>
            {hasCashPayments && <option value="CASH">💰 إرجاع نقدي</option>}
          </select>
          {!hasCashPayments && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              النزيل لم يسدد نقداً في هذه الفاتورة، الإرجاع النقدي غير متاح
            </p>
          )}
        </div>

        <div className="bg-[rgba(245,158,11,0.1)] border border-[var(--gold)] text-sm p-3 rounded-lg">
          <div className="font-bold text-[var(--gold)] mb-1">تأكيد التسوية</div>
          <div className="text-[var(--text-secondary)]">
            سيتم إرجاع <strong className="text-[var(--text-primary)]">{amountValid ? parsedAmount.toFixed(2) : '—'} د.ل</strong>
            {' '}{method === 'WALLET' ? 'إلى محفظة النزيل' : 'نقداً للنزيل'}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleRefund} disabled={saving || !amountValid}>
            {saving ? 'جاري التنفيذ...' : '💵 تأكيد التسوية'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
