'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { apiMutation } from '@/lib/utils/api-mutation';

interface Props {
  open: boolean;
  onClose: () => void;
  itemId: string;
  onSuccess: () => void;
}

export function DisposeLostItemModal({ open, onClose, itemId, onSuccess }: Props) {
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await apiMutation({
      method: 'PATCH',
      url: `/api/admin/lost-found/${itemId}`,
      body: { status: 'DISPOSED', notes: notes || undefined },
      successMsg: '✅ تم التخلص من الغرض',
      errorMsg: 'فشل التخلص من الغرض',
      onSuccess: () => {
        setNotes('');
        onSuccess();
        onClose();
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="🗑️ التخلص من الغرض">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">تأكيد التخلص من الغرض؟ هذا الإجراء لا يمكن التراجع عنه.</p>
        <Input label="ملاحظات التخلص (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">تأكيد التخلص</Button>
        </div>
      </form>
    </Modal>
  );
}
