'use client';

const styles: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/20',
  INACTIVE: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const labels: Record<string, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
};

export function GuestStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.INACTIVE}`}>
      {labels[status] || status}
    </span>
  );
}
