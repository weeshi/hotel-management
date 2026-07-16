'use client';

import { useState } from 'react';
import { Modal, Input, Select, Button } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';

interface RoomOption { id: string; roomNumber: string; floor: number | null }
interface Props {
  open: boolean;
  onClose: () => void;
  rooms: RoomOption[];
  onSuccess: () => void;
}

export function CreateSafeDepositModal({ open, onClose, rooms, onSuccess }: Props) {
  const [form, setForm] = useState({ roomId: '', guestName: '', guestIdNumber: '', notes: '' });
  const [items, setItems] = useState<{ description: string; quantity: number; notes: string }[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await apiPost('/api/admin/safe-deposit', {
      ...form,
      items: items.length ? items : undefined,
    }, {
      successMsg: '✅ تم فتح صندوق الأمانات',
      errorMsg: 'فشل فتح صندوق الأمانات',
      onSuccess: () => {
        setForm({ roomId: '', guestName: '', guestIdNumber: '', notes: '' });
        setItems([]);
        onSuccess();
        onClose();
      },
    });
  }

  function addItem() {
    setItems([...items, { description: '', quantity: 1, notes: '' }]);
  }

  function updateItem(i: number, field: string, value: any) {
    const copy = [...items];
    (copy[i] as any)[field] = value;
    setItems(copy);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  return (
    <Modal open={open} onClose={onClose} title="🔐 فتح صندوق أمانات جديد" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="الغرفة"
          value={form.roomId}
          onChange={e => setForm({ ...form, roomId: e.target.value })}
          required
          placeholder="اختر الغرفة"
          options={rooms.map(r => ({ value: r.id, label: `غرفة ${r.roomNumber}${r.floor ? ` (ط${r.floor})` : ''}` }))}
        />

        <Input label="اسم النزيل" value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} required />
        <Input label="رقم الهوية (اختياري)" value={form.guestIdNumber} onChange={e => setForm({ ...form, guestIdNumber: e.target.value })} />
        <Input label="ملاحظات (اختياري)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold">العناصر المودعة</h4>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>+ إضافة عنصر</Button>
          </div>
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-start mb-2 p-3 bg-[var(--bg-card)] rounded-lg">
              <div className="flex-1">
                <Input placeholder="وصف العنصر" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} />
              </div>
              <div className="w-20">
                <Input type="number" min={1} value={String(item.quantity)} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} />
              </div>
              <button type="button" onClick={() => removeItem(i)} className="text-[var(--red)] mt-2 text-lg">&times;</button>
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">فتح الصندوق</Button>
        </div>
      </form>
    </Modal>
  );
}
