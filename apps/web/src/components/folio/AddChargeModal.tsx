'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (description: string, amount: number) => void;
}

export function AddChargeModal({ open, onClose, onAdd }: Props) {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');

  function handleAdd() {
    if (!desc || !amount) return;
    onAdd(desc, parseFloat(amount));
    setDesc('');
    setAmount('');
  }

  return (
    <Modal open={open} onClose={onClose} title="إضافة رسوم يدوية">
      <div className="space-y-4">
        <Input label="الوصف" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input label="المبلغ (د.ل)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleAdd}>إضافة</Button>
        </div>
      </div>
    </Modal>
  );
}
