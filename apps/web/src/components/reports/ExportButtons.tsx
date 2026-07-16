'use client';

interface Props {
  type: string;
  dateFrom?: string;
  dateTo?: string;
}

export function ExportButtons({ type, dateFrom, dateTo }: Props) {
  function exportReport(format: string) {
    const params = new URLSearchParams({ type, format });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const token = localStorage.getItem('accessToken');
    window.open(`/api/admin/reports/export?${params.toString()}`, '_blank');
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => exportReport('json')}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]">
        JSON
      </button>
      <button onClick={() => exportReport('csv')}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]">
        CSV
      </button>
      <button onClick={() => exportReport('print')}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]">
        🖨️ طباعة
      </button>
    </div>
  );
}
