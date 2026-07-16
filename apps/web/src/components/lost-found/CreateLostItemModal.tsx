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

export function CreateLostItemModal({ open, onClose, rooms, onSuccess }: Props) {
  const [form, setForm] = useState({ description: '', locationFound: '', roomId: '', notes: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await apiPost('/api/admin/lost-found', {
      description: form.description,
      locationFound: form.locationFound,
      roomId: form.roomId || undefined,
      notes: form.notes || undefined,
    }, {
      successMsg: '✅ تم تسجيل الغرض',
      errorMsg: 'فشل تسجيل الغرض',
      onSuccess: () => {
        setForm({ description: '', locationFound: '', roomId: '', notes: '' });
        onSuccess();
        onClose();
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="📦 تسجيل غرض مفقود">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="وصف الغرض" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
        <Input label="مكان العثور" value={form.locationFound} onChange={e => setForm({ ...form, locationFound: e.target.value })} required />
        <Select
          label="الغرفة (اختياري)"
          options={[{ value: '', label: 'بدون غرفة' }, ...rooms.map(r => ({ value: r.id, label: `غرفة ${r.roomNumber}${r.floor ? ` (ط${r.floor})` : ''}` }))]}
          value={form.roomId}
          placeholder="اختر الغرفة"
          onChange={e => setForm({ ...form, roomId: e.target.value })}
        />
        <Input label="ملاحظات (اختياري)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">تسجيل</Button>
        </div>
      </form>
    </Modal>
  );
}
