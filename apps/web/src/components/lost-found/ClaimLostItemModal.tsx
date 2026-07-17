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

export function ClaimLostItemModal({ open, onClose, itemId, onSuccess }: Props) {
  const [claimedByName, setClaimedByName] = useState('');
  const [claimedByIdNumber, setClaimedByIdNumber] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await apiMutation({
      method: 'PATCH',
      url: `/api/admin/lost-found/${itemId}`,
      body: { status: 'CLAIMED', claimedByName, claimedByIdNumber: claimedByIdNumber || undefined },
      successMsg: '✅ تم تسليم الغرض',
      errorMsg: 'فشل تسليم الغرض',
      onSuccess: () => {
        setClaimedByName('');
        setClaimedByIdNumber('');
        onSuccess();
        onClose();
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="📦 تسليم غرض مفقود">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">تأكيد تسليم الغرض للمستلم الشرعي.</p>
        <Input label="اسم المستلم" value={claimedByName} onChange={e => setClaimedByName(e.target.value)} required />
        <Input label="رقم الهوية (اختياري)" value={claimedByIdNumber} onChange={e => setClaimedByIdNumber(e.target.value)} />
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">تأكيد التسليم</Button>
        </div>
      </form>
    </Modal>
  );
}
