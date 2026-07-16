'use client';

export function LostFoundStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    CLAIMED: 'bg-green-500/10 text-green-600 border-green-500/20',
    DISPOSED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };
  const labels: Record<string, string> = {
    PENDING: 'قيد الانتظار',
    CLAIMED: 'تم الاستلام',
    DISPOSED: 'تم التخلص',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.PENDING}`}>
      {labels[status] || status}
    </span>
  );
}
