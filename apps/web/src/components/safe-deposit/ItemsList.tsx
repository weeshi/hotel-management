'use client';

import { Button } from '@/components/ui';
import { apiDelete, apiPost } from '@/lib/utils/api-mutation';
import { useState } from 'react';

interface Item {
  id: string;
  description: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
}

interface Props {
  items: Item[];
  boxId: string;
  isClosed: boolean;
  onRefresh: () => void;
}

export function ItemsList({ items, boxId, isClosed, onRefresh }: Props) {
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);

  async function addItem() {
    if (!newDesc.trim()) return;
    setAdding(true);
    await apiPost(`/api/admin/safe-deposit/${boxId}/items`, {
      description: newDesc.trim(),
      quantity: 1,
    }, { onSuccess: () => { setNewDesc(''); onRefresh(); } });
    setAdding(false);
  }

  async function removeItem(itemId: string) {
    await apiDelete(`/api/admin/safe-deposit/${boxId}/items?itemId=${itemId}`, { onSuccess: onRefresh });
  }

  if (!items.length && isClosed) {
    return <div className="text-center py-6 text-[var(--text-muted)] text-sm">لا توجد عناصر في هذا الصندوق</div>;
  }

  return (
    <div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between p-3 bg-[var(--bg-card)] rounded-lg">
            <div>
              <div className="text-sm font-medium">{item.description}</div>
              <div className="text-xs text-[var(--text-muted)]">
                الكمية: {item.quantity}
                {item.notes ? ` | ${item.notes}` : ''}
              </div>
            </div>
            {!isClosed && (
              <button onClick={() => removeItem(item.id)} className="text-[var(--red)] text-xs hover:underline">حذف</button>
            )}
          </div>
        ))}
      </div>

      {!isClosed && (
        <div className="flex gap-2 mt-3">
          <input
            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            placeholder="وصف العنصر الجديد..."
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <Button size="sm" onClick={addItem} disabled={adding || !newDesc.trim()}>إضافة</Button>
        </div>
      )}
    </div>
  );
}
