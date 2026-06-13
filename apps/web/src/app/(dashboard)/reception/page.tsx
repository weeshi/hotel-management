'use client';

import { useState, useEffect } from 'react';
import { DataCard } from '@/components/ui';

export default function ReceptionDashboard() {
  const [stats, setStats] = useState([
    { label: 'حجوزات اليوم', value: '—', icon: '📅', color: 'var(--gold)' },
    { label: 'غرف مشغولة', value: '—', icon: '🚪', color: 'var(--blue)' },
    { label: 'واصلون اليوم', value: '—', icon: '🔑', color: 'var(--green)' },
    { label: 'مغادرون اليوم', value: '—', icon: '🧾', color: 'var(--purple)' },
    { label: 'إشغال', value: '—', icon: '📊', color: 'var(--yellow)' },
    { label: 'إيرادات اليوم', value: '—', icon: '💰', color: 'var(--green)' },
  ]);

  const [todayArrivals, setTodayArrivals] = useState<any[]>([]);
  const [todayDepartures, setTodayDepartures] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('accessToken');
        const headers = { Authorization: `Bearer ${token}` };

        const [roomsRes, bookingsRes] = await Promise.all([
          fetch('/api/admin/rooms', { headers }),
          fetch('/api/admin/bookings', { headers }),
        ]);

        const roomsData = await roomsRes.json();
        const bookingsData = await bookingsRes.json();

        if (roomsData.success && bookingsData.success) {
          const rooms = roomsData.data;
          const bookings = bookingsData.data;

          const occupied = rooms.filter((r: any) => r.status === 'OCCUPIED').length;
          const total = rooms.length;

          const todayArrivalsList = bookings.filter((b: any) =>
            ['CONFIRMED', 'CHECKED_IN'].includes(b.status)
          );
          const todayDeparturesList = bookings.filter((b: any) =>
            b.status === 'CHECKED_IN'
          );

          setStats([
            { label: 'حجوزات اليوم', value: String(bookings.length), icon: '📅', color: 'var(--gold)' },
            { label: 'غرف مشغولة', value: `${occupied}/${total}`, icon: '🚪', color: 'var(--blue)' },
            { label: 'واصلون اليوم', value: String(todayArrivalsList.length), icon: '🔑', color: 'var(--green)' },
            { label: 'مغادرون اليوم', value: String(todayDeparturesList.length), icon: '🧾', color: 'var(--purple)' },
            { label: 'إشغال', value: total ? `${Math.round((occupied / total) * 100)}%` : '—', icon: '📊', color: 'var(--yellow)' },
            { label: 'إيرادات اليوم', value: '—', icon: '💰', color: 'var(--green)' },
          ]);

          setTodayArrivals(todayArrivalsList.slice(0, 5));
          setTodayDepartures(todayDeparturesList.slice(0, 5));
        }
      } catch {}
    }
    fetchData();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">🏠 لوحة التحكم</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat) => (
          <DataCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
            <span>🔑</span> الواصلون اليوم
          </h3>
          {todayArrivals.length === 0 ? (
            <div className="text-center py-6 text-sm text-[var(--text-muted)]">لا يوجد واصلون اليوم</div>
          ) : (
            <div className="space-y-3">
              {todayArrivals.map((booking: any) => (
                <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]">
                  <div>
                    <div className="font-semibold text-sm">{booking.guestName || booking.guest?.name || 'ضيف'}</div>
                    <div className="text-xs text-[var(--text-muted)]">#{booking.bookingNo}</div>
                  </div>
                  <span className={`tag ${booking.status === 'CHECKED_IN' ? 'tag-green' : 'tag-yellow'}`}>
                    {booking.status === 'CHECKED_IN' ? 'تم الدخول' : 'قيد الانتظار'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
            <span>🧾</span> المغادرون اليوم
          </h3>
          {todayDepartures.length === 0 ? (
            <div className="text-center py-6 text-sm text-[var(--text-muted)]">لا يوجد مغادرون اليوم</div>
          ) : (
            <div className="space-y-3">
              {todayDepartures.map((booking: any) => {
                const balance = booking.folio?.balance || 0;
                return (
                  <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]">
                    <div>
                      <div className="font-semibold text-sm">{booking.guestName || booking.guest?.name || 'ضيف'}</div>
                      <div className="text-xs text-[var(--text-muted)]">#{booking.bookingNo}</div>
                    </div>
                    {balance > 0 ? (
                      <span className="tag tag-red">رصيد: {balance} د.ل</span>
                    ) : (
                      <span className="tag tag-green">مسدد</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
