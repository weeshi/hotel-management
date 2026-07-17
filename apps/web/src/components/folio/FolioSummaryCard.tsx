'use client';

import { Card } from '@/components/ui';
import type { FolioSummary } from './types';

interface Props {
  folio: FolioSummary | null;
}

export function FolioSummaryCard({ folio }: Props) {
  return (
    <Card title="📊 ملخص">
      {folio ? (
        <div className="space-y-3">
          {[
            { label: 'إجمالي الرسوم', value: `${folio.totalCharges.toFixed(2)} د.ل`, color: 'var(--text-primary)' },
            { label: 'المدفوع', value: `${folio.totalPaid.toFixed(2)} د.ل`, color: 'var(--green)' },
            { label: 'المتبقي', value: `${folio.balance.toFixed(2)} د.ل`, color: folio.balance > 0 ? 'var(--gold)' : 'var(--green)' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-center p-3 rounded-lg bg-[var(--bg-primary)]">
              <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
              <span className="font-bold" style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[var(--text-muted)]">اختر حجزاً لعرض الملخص</div>
      )}
    </Card>
  );
}
