'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (type: 'PERCENTAGE' | 'FIXED', value: number, reason: string) => void;
}

export function DiscountModal({ open, onClose, onApply }: Props) {
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  function handleApply() {
    if (!value || !reason) return;
    onApply(type, parseFloat(value), reason);
    setValue('');
    setReason('');
  }

  return (
    <Modal open={open} onClose={onClose} title="تطبيق خصم">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">نوع الخصم</label>
          <select value={type} onChange={(e) => setType(e.target.value as 'PERCENTAGE' | 'FIXED')}
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]">
            <option value="PERCENTAGE">نسبة مئوية (%)</option>
            <option value="FIXED">قيمة ثابتة (د.ل)</option>
          </select>
        </div>
        <Input label={type === 'PERCENTAGE' ? 'النسبة (%)' : 'المبلغ (د.ل)'} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        <Input label="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleApply}>تطبيق</Button>
        </div>
      </div>
    </Modal>
  );
}
