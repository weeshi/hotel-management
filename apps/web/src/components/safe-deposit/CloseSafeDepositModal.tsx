'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { apiMutation } from '@/lib/utils/api-mutation';

interface Props {
  open: boolean;
  onClose: () => void;
  boxId: string;
  onSuccess: () => void;
}

export function CloseSafeDepositModal({ open, onClose, boxId, onSuccess }: Props) {
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await apiMutation({
      method: 'PATCH',
      url: `/api/admin/safe-deposit/${boxId}`,
      body: { status: 'CLOSED', notes: notes || undefined },
      successMsg: '✅ تم إغلاق صندوق الأمانات',
      errorMsg: 'فشل إغلاق صندوق الأمانات',
      onSuccess: () => { setNotes(''); onSuccess(); onClose(); },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="🔒 إغلاق صندوق الأمانات">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">تأكيد إغلاق صندوق الأمانات؟ يجب التحقق من جميع العناصر مع النزيل قبل الإغلاق.</p>
        <Input label="ملاحظات الإغلاق (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">تأكيد الإغلاق</Button>
        </div>
      </form>
    </Modal>
  );
}
