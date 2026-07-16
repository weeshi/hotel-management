'use client';

import { Badge } from '@/components/ui';

const statusVariant: Record<string, 'gold' | 'green'> = { ACTIVE: 'gold', CLOSED: 'green' };
const statusLabel: Record<string, string> = { ACTIVE: 'نشط', CLOSED: 'مغلق' };

export function SafeDepositStatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant[status] || 'gold'}>{statusLabel[status] || status}</Badge>;
}
