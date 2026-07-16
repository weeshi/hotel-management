'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import type { Service } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  services: Service[];
  onAdd: (serviceId: string, quantity: number) => Promise<void>;
}

export function AddServiceModal({ open, onClose, services, onAdd }: Props) {
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!selectedServiceId) return;
    setLoading(true);
    try {
      await onAdd(selectedServiceId, parseInt(qty) || 1);
      setSelectedServiceId('');
      setQty('1');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🛎️ إضافة خدمة للفاتورة">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">الخدمة</label>
          <select value={selectedServiceId} onChange={(e) => setSelectedServiceId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]">
            <option value="">اختر خدمة...</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.nameAr || s.name} — {s.price.toFixed(2)} د.ل</option>
            ))}
          </select>
        </div>
        <Input label="الكمية" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleAdd} loading={loading} disabled={!selectedServiceId}>إضافة</Button>
        </div>
      </div>
    </Modal>
  );
}
