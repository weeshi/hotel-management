'use client';

import { Card } from '@/components/ui';

interface Stat {
  label: string;
  value: number;
  icon: string;
  color: string;
}

interface Props {
  stats: Stat[];
}

export function SummaryCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((card) => (
        <Card key={card.label} className="!p-4 text-center">
          <div className="text-2xl mb-1">{card.icon}</div>
          <div className="text-lg font-bold" style={{ color: card.color }}>{card.value}</div>
          <div className="text-xs text-[var(--text-muted)]">{card.label}</div>
        </Card>
      ))}
    </div>
  );
}
