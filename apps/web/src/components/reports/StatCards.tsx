'use client';

import { Card } from '@/components/ui';

interface StatItem { icon: string; value: string; label: string; color: string }

interface Props {
  items: StatItem[];
}

export function StatCards({ items }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map(item => (
        <Card key={item.label} className="!p-4 text-center">
          <div className="text-2xl mb-1">{item.icon}</div>
          <div className="text-lg font-bold" style={{ color: item.color }}>{item.value}</div>
          <div className="text-xs text-[var(--text-muted)]">{item.label}</div>
        </Card>
      ))}
    </div>
  );
}
