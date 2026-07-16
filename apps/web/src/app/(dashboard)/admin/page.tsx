'use client';

import { useEffect, useState } from 'react';
import { DataCard, Badge } from '@/components/ui';

interface DashboardStats {
  totalRooms: number;
  totalUsers: number;
  activeBookings: number;
  occupancyPercent: string;
  totalRevenue: number;
  todayRevenue: number;
  pendingPayments: number;
}

interface BookingRow {
  id: string;
  bookingNo: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBookings, setRecentBookings] = useState<BookingRow[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('accessToken');
        const headers = { Authorization: `Bearer ${token}` };

        const [roomsRes, bookingsRes, usersRes, paymentsRes] = await Promise.all([
          fetch('/api/admin/rooms', { headers }),
          fetch('/api/admin/bookings?limit=100', { headers }),
          fetch('/api/admin/users', { headers }),
          fetch('/api/admin/payments?limit=100', { headers }),
        ]);

        const roomsData = await roomsRes.json();
        const bookingsData = await bookingsRes.json();
        const usersData = await usersRes.json();
        const paymentsData = await paymentsRes.json();

        const totalRooms = roomsData.data?.length || 0;
        const allBookings = bookingsData.data || [];
        const activeBookings = allBookings.filter((b: any) => ['CONFIRMED', 'CHECKED_IN'].includes(b.status)).length;
        const totalUsers = usersData.data?.length || 0;

        const allPayments = paymentsData.data || [];
        const succeededPayments = allPayments.filter((p: any) => p.status === 'SUCCEEDED');
        const totalRevenue = succeededPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
        const pendingPayments = allPayments.filter((p: any) => p.status === 'PENDING').length;

        const today = new Date().toISOString().slice(0, 10);
        const todayRevenue = succeededPayments
          .filter((p: any) => p.createdAt?.slice(0, 10) === today)
          .reduce((sum: number, p: any) => sum + p.amount, 0);

        setStats({
          totalRooms,
          totalUsers,
          activeBookings,
          occupancyPercent: totalRooms ? `${Math.round((activeBookings / totalRooms) * 100)}%` : '—',
          totalRevenue,
          todayRevenue,
          pendingPayments,
        });

        setRecentBookings(
          allBookings.slice(0, 5).map((b: any) => ({
            id: b.id,
            bookingNo: b.bookingNo,
            guestName: b.guestName || b.guest?.name || '—',
            status: b.status,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            totalAmount: b.totalAmount || 0,
          }))
        );
      } catch {}
    }
    fetchData();
  }, []);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'gold' | 'green' | 'blue' | 'red' }> = {
      PENDING: { label: 'قيد الانتظار', variant: 'gold' },
      CONFIRMED: { label: 'مؤكد', variant: 'green' },
      CHECKED_IN: { label: 'مسجل الدخول', variant: 'blue' },
      CHECKED_OUT: { label: 'مغادر', variant: 'red' },
      CANCELLED: { label: 'ملغي', variant: 'red' },
    };
    const m = map[status] || { label: status, variant: 'gold' as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">⚙️ لوحة الإدارة</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <DataCard label="إجمالي الغرف" value={String(stats?.totalRooms ?? '—')} icon="🚪" color="var(--gold)" />
        <DataCard label="الحجوزات النشطة" value={String(stats?.activeBookings ?? '—')} icon="📋" color="var(--blue)" />
        <DataCard label="المستخدمون" value={String(stats?.totalUsers ?? '—')} icon="👥" color="var(--green)" />
        <DataCard label="إشغال اليوم" value={String(stats?.occupancyPercent ?? '—')} icon="📊" color="var(--purple)" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <DataCard label="إجمالي الإيرادات" value={stats ? `${stats.totalRevenue.toFixed(2)} د.ل` : '—'} icon="💰" color="var(--gold)" />
        <DataCard label="إيرادات اليوم" value={stats ? `${stats.todayRevenue.toFixed(2)} د.ل` : '—'} icon="📅" color="var(--green)" />
        <DataCard label="مدفوعات معلقة" value={String(stats?.pendingPayments ?? '—')} icon="⏳" color="var(--blue)" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
            <span>⚡</span> إجراءات سريعة
          </h3>
          <div className="space-y-3">
            <a href="/admin/rooms" className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-card-hover)] transition-colors text-sm">
              <span>🚪</span> إدارة الغرف
            </a>
            <a href="/admin/users" className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-card-hover)] transition-colors text-sm">
              <span>👥</span> إدارة المستخدمين
            </a>
            <a href="/admin/settings" className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-card-hover)] transition-colors text-sm">
              <span>⚙️</span> إعدادات الفندق
            </a>
            <a href="/reception/payments" className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-card-hover)] transition-colors text-sm">
              <span>💳</span> سجل المدفوعات
            </a>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
            <span>📋</span> آخر الحجوزات
          </h3>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">لا توجد حجوزات بعد</p>
          ) : (
            <div className="space-y-2">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-primary)] text-sm">
    <div data-component="AdminPage">
                    <span className="font-bold text-[var(--gold)]">#{b.bookingNo}</span>
                    <span className="mx-2 text-[var(--text-muted)]">|</span>
                    <span>{b.guestName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">{new Date(b.checkIn).toLocaleDateString('ar-LY')}</span>
                    {statusBadge(b.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
