'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';

interface Props {
  open: boolean;
  payment: { id: string; amount: number; refundedAmount: number; method: string } | null;
  onClose: () => void;
  onRefund: (paymentId: string, amount: number, reason: string) => void;
}

export function RefundModal({ open, payment, onClose, onRefund }: Props) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  if (!payment) return null;
  const p = payment;

  const maxRefund = p.amount - p.refundedAmount;

  function handleRefund() {
    const val = parseFloat(amount);
    if (!val || val <= 0 || val > maxRefund || !reason) return;
    onRefund(p.id, val, reason);
    setAmount('');
    setReason('');
  }

  return (
    <Modal open={open} onClose={onClose} title="💰 استرداد دفعة">
      <div className="space-y-4">
        <div className="bg-[rgba(231,76,60,0.1)] border border-[rgba(231,76,60,0.3)] rounded-xl p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">الدفعة الأصلية</span>
            <span className="font-bold">{p.amount.toFixed(2)} د.ل</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">المسترد سابقاً</span>
            <span className="font-bold">{p.refundedAmount.toFixed(2)} د.ل</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-[rgba(231,76,60,0.2)]">
            <span className="text-[var(--text-secondary)]">المتبقي للاسترداد</span>
            <span className="font-bold text-[var(--gold)]">{maxRefund.toFixed(2)} د.ل</span>
          </div>
        </div>
        <Input label="المبلغ المسترد" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={maxRefund} />
        <Input label="سبب الاسترداد" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="أدخل سبب الاسترداد..." />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleRefund} disabled={!amount || !reason || parseFloat(amount) > maxRefund}>تأكيد الاسترداد</Button>
        </div>
      </div>
    </Modal>
  );
}
