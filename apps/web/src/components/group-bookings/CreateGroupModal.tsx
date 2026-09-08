'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateGroupModal({ open, onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    await apiPost('/api/admin/group-bookings', { name: name.trim() }, {
      successMsg: '✅ تم إنشاء المجموعة',
      errorMsg: 'فشل إنشاء المجموعة',
      onSuccess: () => {
        setName('');
        onSuccess();
        onClose();
      },
    });

    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="👥 مجموعة جديدة">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="اسم المجموعة"
          placeholder="مثال: وفد شركة النفط"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit" loading={loading}>إنشاء المجموعة</Button>
        </div>
      </form>
    </Modal>
  );
}
