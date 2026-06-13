'use client';

import { useEffect, useState } from 'react';
import { DataCard } from '@/components/ui';

export default function AdminDashboard() {
  const [stats, setStats] = useState([
    { label: 'إجمالي الغرف', value: '—', icon: '🚪', color: 'var(--gold)' },
    { label: 'الحجوزات النشطة', value: '—', icon: '📋', color: 'var(--blue)' },
    { label: 'المستخدمون', value: '—', icon: '👥', color: 'var(--green)' },
    { label: 'إشغال اليوم', value: '—', icon: '📊', color: 'var(--purple)' },
  ]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = localStorage.getItem('accessToken');
        const headers = { Authorization: `Bearer ${token}` };

        const [roomsRes, bookingsRes] = await Promise.all([
          fetch('/api/admin/rooms', { headers }),
          fetch('/api/admin/bookings', { headers }),
        ]);

        const roomsData = await roomsRes.json();
        const bookingsData = await bookingsRes.json();

        const totalRooms = roomsData.data?.length || 0;
        const activeBookings = bookingsData.data?.filter((b: any) => ['CONFIRMED', 'CHECKED_IN'].includes(b.status)).length || 0;

        setStats([
          { label: 'إجمالي الغرف', value: String(totalRooms), icon: '🚪', color: 'var(--gold)' },
          { label: 'الحجوزات النشطة', value: String(activeBookings), icon: '📋', color: 'var(--blue)' },
          { label: 'المستخدمون', value: '2', icon: '👥', color: 'var(--green)' },
          { label: 'إشغال اليوم', value: totalRooms ? `${Math.round((activeBookings / totalRooms) * 100)}%` : '—', icon: '📊', color: 'var(--purple)' },
        ]);
      } catch {}
    }
    fetchStats();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">⚙️ لوحة الإدارة</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <DataCard key={stat.label} {...stat} />
        ))}
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
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
            <span>📊</span> نظرة عامة
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            مرحباً بك في لوحة إدارة الفندق. يمكنك من هنا إدارة الغرف والمستخدمين وإعدادات الفندق.
          </p>
        </div>
      </div>
    </div>
  );
}
