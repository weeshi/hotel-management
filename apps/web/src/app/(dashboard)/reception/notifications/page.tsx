'use client';

import { useState, useEffect } from 'react';
import { Badge, Button } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface Notification {
  id: string;
  type: string;
  event: string;
  subject: string | null;
  body: string | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
}

const typeLabels: Record<string, string> = {
  BOOKING_CREATED: 'حجز جديد',
  CHECK_IN: 'تسجيل دخول',
  CHECK_OUT: 'تسجيل خروج',
  CANCELLATION: 'إلغاء',
  PAYMENT: 'دفعة',
  BOOKING_REMINDER: 'تذكير',
};

const typeColors: Record<string, 'gold' | 'green' | 'blue' | 'red' | 'purple'> = {
  BOOKING_CREATED: 'gold',
  CHECK_IN: 'green',
  CHECK_OUT: 'blue',
  CANCELLATION: 'red',
  PAYMENT: 'purple',
  BOOKING_REMINDER: 'blue',
};

export default function ReceptionNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  async function fetchNotifications() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const url = filter ? `/api/admin/notifications?status=${filter}` : '/api/admin/notifications';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setNotifications(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchNotifications(); }, [filter]);

  async function markRead(id: string) {
    await getCsrfToken();
    try {
      await fetch(`/api/admin/notifications/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          ...csrfHeaders(),
        },
      });
      fetchNotifications();
    } catch {}
  }

  async function markAllRead() {
    await getCsrfToken();
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ markAll: true }),
      });
      fetchNotifications();
    } catch {}
  }

  const hasUnread = notifications.some(n => n.status === 'PENDING');

  return (
    <div data-component="ReceptionNotificationsPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔔 الإشعارات</h1>
        {hasUnread && (
          <Button size="sm" variant="secondary" onClick={markAllRead}>
            تحديد الكل كمقروء
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {['', 'PENDING', 'READ'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === s
                ? 'bg-[var(--gold)] text-black'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            {s === '' ? 'الكل' : s === 'PENDING' ? 'غير مقروءة' : 'مقروءة'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">لا توجد إشعارات</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between p-4 rounded-xl border transition-colors ${
                n.status === 'PENDING'
                  ? 'bg-[rgba(201,168,76,0.05)] border-[var(--gold)]/30'
                  : 'bg-[var(--bg-card)] border-[var(--border)]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={typeColors[n.type] || 'gold'}>{typeLabels[n.type] || n.type}</Badge>
                  {n.status === 'PENDING' && <span className="w-2 h-2 rounded-full bg-[var(--gold)]" />}
                </div>
                {n.subject && <div className="font-semibold text-sm">{n.subject}</div>}
                {n.body && <div className="text-xs text-[var(--text-secondary)] mt-1">{n.body}</div>}
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {new Date(n.createdAt).toLocaleString('ar-LY')}
                </div>
              </div>
              {n.status === 'PENDING' && (
                <button
                  onClick={() => markRead(n.id)}
                  className="text-xs text-[var(--blue)] hover:underline whitespace-nowrap mr-4"
                >
                  تحديد كمقروء
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
