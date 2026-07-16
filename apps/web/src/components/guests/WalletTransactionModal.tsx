'use client';

import { useState } from 'react';
import { Modal, Input, Select, Button } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';
import { useAuth } from '@/contexts/auth-context';

const PAYMENT_METHODS = [
  { value: 'CASH', label: '💰 نقداً' },
  { value: 'TRANSFER', label: '🏦 حوالة بنكية' },
  { value: 'CARD', label: '💳 بطاقة' },
  { value: 'CHEQUE', label: '📝 شيك' },
];

const RECEPTION_LIMIT = 500;

interface Props {
  open: boolean;
  onClose: () => void;
  guestId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  onSuccess: () => void;
}

export function WalletTransactionModal({ open, onClose, guestId, type, onSuccess }: Props) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('CASH');
  const { user } = useAuth();
  const userRole = user?.role || '';

  const isReception = userRole === 'RECEPTION';
  const maxAmount = isReception && type === 'WITHDRAWAL' ? RECEPTION_LIMIT : undefined;
  const numAmount = parseFloat(amount) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body: Record<string, any> = {
      type,
      amount: numAmount,
      method,
      idempotencyKey: crypto.randomUUID(),
    };
    if (description.trim()) body.description = description.trim();

    const label = type === 'DEPOSIT' ? 'الإيداع' : 'السحب';

    await apiPost(`/api/admin/guests/${guestId}/wallet`, body, {
      successMsg: `✅ تم ${label} بنجاح`,
      errorMsg: `فشل ${label}`,
      onSuccess: () => {
        setAmount('');
        setDescription('');
        setMethod('CASH');
        onSuccess();
        onClose();
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={type === 'DEPOSIT' ? '💰 إيداع في المحفظة' : '💰 سحب من المحفظة'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          {type === 'DEPOSIT' ? 'إضافة رصيد إلى محفظة النزيل.' : 'سحب رصيد من محفظة النزيل.'}
        </p>

        <div>
          <Input
            label="المبلغ"
            type="number"
            step="0.01"
            min="0.01"
            max={maxAmount}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
          {maxAmount && numAmount > maxAmount && (
            <p className="text-[10px] text-[var(--red)] mt-1">
              ⚠️ الحد الأقصى للسحب للموظفين هو {RECEPTION_LIMIT} د.ل
            </p>
          )}
          {maxAmount && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              الحد الأقصى للسحب: {RECEPTION_LIMIT} د.ل
            </p>
          )}
        </div>

        <Select
          label="طريقة الدفع"
          value={method}
          onChange={e => setMethod(e.target.value)}
          options={PAYMENT_METHODS}
        />

        <Input
          label="الوصف (اختياري)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">تأكيد</Button>
        </div>
      </form>
    </Modal>
  );
}
