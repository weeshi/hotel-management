'use client';

import Link from 'next/link';
import { Table, Badge } from '@/components/ui';

// --- Types ---

interface SafeBoxRow {
  id: string;
  serialNumber: number;
  status: string;
  openedAt: string;
  room: { roomNumber: string; floor: number | null } | null;
  booking: { bookingNo: string; guest: { name: string } } | null;
  externalClient: { name: string } | null;
  openedBy: { name: string };
  items: any[];
}

interface SafeBoxTableProps {
  boxes: SafeBoxRow[];
  loading?: boolean;
  onRowClick?: (box: SafeBoxRow) => void;
}

// --- Helpers ---

function resolveClientName(box: SafeBoxRow): string {
  return box.booking?.guest?.name || box.externalClient?.name || '—';
}

function statusBadgeVariant(status: string): 'gold' | 'green' | 'red' {
  switch (status) {
    case 'ACTIVE': return 'gold';
    case 'CLOSED': return 'green';
    default: return 'red';
  }
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط',
  CLOSED: 'مغلق',
};

// --- Component ---

export function SafeBoxTable({ boxes, loading, onRowClick }: SafeBoxTableProps) {
  const columns = [
    {
      key: 'serialNumber',
      header: '#',
      render: (b: SafeBoxRow) => <span className="font-bold text-[var(--text-primary)]">{b.serialNumber}</span>,
      className: 'w-16',
    },
    {
      key: 'clientName',
      header: 'اسم العميل',
      render: (b: SafeBoxRow) => (
        <div>
          <span className="font-medium">{resolveClientName(b)}</span>
          {b.booking && <span className="text-xs text-[var(--text-muted)] mr-2">({b.booking.bookingNo})</span>}
        </div>
      ),
    },
    {
      key: 'room',
      header: 'الغرفة',
      render: (b: SafeBoxRow) => (
        <span className="text-[var(--text-secondary)]">
          {b.room ? `${b.room.roomNumber}${b.room.floor ? ` (ط${b.room.floor})` : ''}` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (b: SafeBoxRow) => (
        <Badge variant={statusBadgeVariant(b.status)}>
          {statusLabels[b.status] || b.status}
        </Badge>
      ),
    },
    {
      key: 'openedAt',
      header: 'تاريخ الفتح',
      render: (b: SafeBoxRow) => (
        <span className="text-xs text-[var(--text-secondary)]">
          {new Date(b.openedAt).toLocaleDateString('ar-LY')}
        </span>
      ),
    },
    {
      key: 'itemsCount',
      header: 'العناصر',
      render: (b: SafeBoxRow) => (
        <span className="text-[var(--text-secondary)]">{b.items?.length || 0}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (b: SafeBoxRow) => (
        <Link
          href={`/safeboxes/${b.id}`}
          className="inline-block px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--gold)]/10 text-[var(--gold)] hover:bg-[var(--gold)]/20 transition-colors"
        >
          التفاصيل
        </Link>
      ),
      className: 'w-24 text-left',
    },
  ];

  return (
    <Table
      columns={columns}
      data={boxes}
      keyExtractor={(b) => b.id}
      onRowClick={onRowClick}
      loading={loading}
      emptyMessage="لا توجد صناديق أمانات"
    />
  );
}
