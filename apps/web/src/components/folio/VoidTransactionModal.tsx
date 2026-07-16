'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';

interface Props {
  open: boolean;
  transaction: { id: string; description: string; amount: number } | null;
  onClose: () => void;
  onVoid: (transactionId: string, reason: string) => void;
}

export function VoidTransactionModal({ open, transaction, onClose, onVoid }: Props) {
  const [reason, setReason] = useState('');

  function handleVoid() {
    if (!transaction || !reason) return;
    onVoid(transaction.id, reason);
    setReason('');
  }

  return (
    <Modal open={open} onClose={onClose} title="❌ إلغاء معاملة">
      {transaction && (
        <div className="space-y-4">
          <div className="bg-[rgba(231,76,60,0.1)] border border-[rgba(231,76,60,0.3)] rounded-xl p-3 text-sm">
            <p className="text-[var(--text-secondary)]">المعاملة: <strong className="text-[var(--text-primary)]">{transaction.description}</strong></p>
            <p className="text-[var(--text-secondary)] mt-1">المبلغ: <strong className="text-[var(--gold)]">{Math.abs(Number(transaction.amount)).toFixed(2)} د.ل</strong></p>
          </div>
          <Input label="سبب الإلغاء" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="أدخل سبب الإلغاء..." />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>تراجع</Button>
            <Button onClick={handleVoid} disabled={!reason}>تأكيد الإلغاء</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
