'use client';

import { useState, useEffect } from 'react';
import { Card, DataCard } from '@/components/ui';

export default function ManagerDashboard() {
  const [stats] = useState([
    { label: 'الحجوزات هذا الشهر', value: '—', icon: '📅', color: 'var(--gold)' },
    { label: 'معدل الإشغال', value: '—', icon: '📊', color: 'var(--blue)' },
    { label: 'الإيرادات الشهرية', value: '—', icon: '💰', color: 'var(--green)' },
    { label: 'متوسط الإقامة', value: '—', icon: '📆', color: 'var(--purple)' },
  ]);

  return (
    <div data-component="ManagerPage">
      <h1 className="text-2xl font-bold mb-6">📊 التقارير والإحصائيات</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <DataCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="حجوزات اليوم" icon="📅" className="!p-4">
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            سيتم تفعيل التقارير قريباً
          </div>
        </Card>

        <Card title="الإيرادات" icon="💰" className="!p-4">
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            سيتم تفعيل التقارير قريباً
          </div>
        </Card>

        <Card title="معدل الإشغال" icon="📊" className="!p-4">
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            سيتم تفعيل التقارير قريباً
          </div>
        </Card>

        <Card title="خدمات النزلاء" icon="🛎️" className="!p-4">
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            سيتم تفعيل التقارير قريباً
          </div>
        </Card>
      </div>
    </div>
  );
}
