'use client';

import { useState, useEffect } from 'react';
import { Input, Select, Badge, Card } from '@/components/ui';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue: string | null;
  newValue: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  booking?: { bookingNo: string } | null;
}

const actionLabels: Record<string, string> = {
  CREATE: 'إنشاء',
  UPDATE: 'تحديث',
  DELETE: 'حذف',
  CHECK_IN: 'تسجيل دخول',
  CHECK_OUT: 'تسجيل خروج',
  CANCEL: 'إلغاء',
  TOGGLE_ACTIVE: 'تغيير الحالة',
  PAYMENT: 'دفع',
  CHARGE: 'إضافة رسوم',
  DISCOUNT: 'خصم',
};

const actionColors: Record<string, 'green' | 'blue' | 'red' | 'gold' | 'purple'> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  CHECK_IN: 'green',
  CHECK_OUT: 'gold',
  CANCEL: 'red',
  TOGGLE_ACTIVE: 'purple',
  PAYMENT: 'gold',
  CHARGE: 'blue',
  DISCOUNT: 'purple',
};

const entityLabels: Record<string, string> = {
  BOOKING: 'حجز',
  USER: 'مستخدم',
  SERVICE: 'خدمة',
  RATE_PLAN: 'خطة سعر',
  CANCELLATION_POLICY: 'سياسة إلغاء',
  ROOM: 'غرفة',
  PAYMENT: 'دفعة',
  FOLIO: 'فاتورة',
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [searchId, setSearchId] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  async function fetchLogs() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filterEntity) params.set('entity', filterEntity);
      if (filterAction) params.set('action', filterAction);
      if (searchId) params.set('entityId', searchId);

      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); }, [filterEntity, filterAction, searchId]);
  useEffect(() => { fetchLogs(); }, [page, filterEntity, filterAction, searchId]);

  const actionDisplay = (action: string) => actionLabels[action] || action;
  const entityDisplay = (entity: string) => entityLabels[entity] || entity;
  const actionColor = (action: string) => actionColors[action] || 'gold';

  return (
    <div data-component="AdminAuditLogsPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📋 سجل التدقيق</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <Select
          label="الكيان"
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          options={[
            { value: '', label: 'الكل' },
            { value: 'BOOKING', label: 'حجز' },
            { value: 'USER', label: 'مستخدم' },
            { value: 'SERVICE', label: 'خدمة' },
            { value: 'RATE_PLAN', label: 'خطة سعر' },
            { value: 'CANCELLATION_POLICY', label: 'سياسة إلغاء' },
            { value: 'ROOM', label: 'غرفة' },
            { value: 'PAYMENT', label: 'دفعة' },
            { value: 'FOLIO', label: 'فاتورة' },
          ]}
        />
        <Select
          label="الإجراء"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          options={[
            { value: '', label: 'الكل' },
            { value: 'CREATE', label: 'إنشاء' },
            { value: 'UPDATE', label: 'تحديث' },
            { value: 'DELETE', label: 'حذف' },
            { value: 'CHECK_IN', label: 'تسجيل دخول' },
            { value: 'CHECK_OUT', label: 'تسجيل خروج' },
            { value: 'CANCEL', label: 'إلغاء' },
            { value: 'PAYMENT', label: 'دفع' },
            { value: 'CHARGE', label: 'رسوم' },
            { value: 'DISCOUNT', label: 'خصم' },
          ]}
        />
        <Input
          label="بحث بالمعرف"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          placeholder="معرف الكيان..."
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">لا توجد سجلات تدقيق</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-card)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">التاريخ</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">الكيان</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">الإجراء</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">المعرف</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] transition-colors">
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('ar-LY')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="gold">{entityDisplay(log.entity)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={actionColor(log.action)}>{actionDisplay(log.action)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] font-mono">{log.entityId.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-[var(--text-secondary)]">
                      {log.booking && <span className="text-[var(--gold)] font-semibold">#{log.booking.bookingNo} </span>}
                      {log.oldValue && log.newValue && (
                        <span className="text-[var(--text-muted)]">
                          {log.oldValue} → {log.newValue}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-sm text-[var(--text-muted)]">صفحة {page} من {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
