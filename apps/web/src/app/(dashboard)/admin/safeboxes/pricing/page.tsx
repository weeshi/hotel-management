'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Spinner } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { addToast } from '@/lib/utils/toast';

interface PackageItem {
  id: string;
  name: string;
  dailyPrice: number;
  weeklyPrice: number;
  monthlyPrice: number;
  isActive: boolean;
  createdAt: string;
}

export default function SafeBoxPricingPage() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [dailyPrice, setDailyPrice] = useState('');
  const [weeklyPrice, setWeeklyPrice] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchPackages() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/settings/safebox-packages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPackages(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPackages();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dailyPrice || !weeklyPrice || !monthlyPrice) return;
    setSaving(true);
    await getCsrfToken();

    try {
      const res = await fetch('/api/admin/settings/safebox-packages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          name: name.trim(),
          dailyPrice: Number(dailyPrice),
          weeklyPrice: Number(weeklyPrice),
          monthlyPrice: Number(monthlyPrice),
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', '✅ تم إضافة الباقة');
        setName('');
        setDailyPrice('');
        setWeeklyPrice('');
        setMonthlyPrice('');
        fetchPackages();
      } else {
        addToast('error', data.error?.message || 'فشل إضافة الباقة');
      }
    } catch {
      addToast('error', 'حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-component="SafeBoxPricingPage">
      <h1 className="text-2xl font-bold mb-6">💰 باقات تسعير صناديق الأمانات</h1>

      {/* --- Create Form --- */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <h2 className="text-sm font-bold mb-4">إضافة باقة جديدة</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label="اسم الباقة"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: الباقة الذهبية"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="السعر اليومي (د.ل)"
              type="number"
              min={0}
              step={0.01}
              value={dailyPrice}
              onChange={(e) => setDailyPrice(e.target.value)}
              placeholder="0.00"
              required
            />
            <Input
              label="السعر الأسبوعي (د.ل)"
              type="number"
              min={0}
              step={0.01}
              value={weeklyPrice}
              onChange={(e) => setWeeklyPrice(e.target.value)}
              placeholder="0.00"
              required
            />
            <Input
              label="السعر الشهري (د.ل)"
              type="number"
              min={0}
              step={0.01}
              value={monthlyPrice}
              onChange={(e) => setMonthlyPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <Button type="submit" disabled={saving || !name.trim() || !dailyPrice || !weeklyPrice || !monthlyPrice}>
            {saving ? 'جاري الحفظ...' : 'إضافة'}
          </Button>
        </form>
      </div>

      {/* --- Packages List --- */}
      {loading ? (
        <Spinner />
      ) : packages.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">لا توجد باقات بعد. أضف الباقة الأولى أعلاه.</p>
      ) : (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="text-right p-3 font-medium">الاسم</th>
                <th className="text-right p-3 font-medium">يومي</th>
                <th className="text-right p-3 font-medium">أسبوعي</th>
                <th className="text-right p-3 font-medium">شهري</th>
                <th className="text-right p-3 font-medium">الحالة</th>
                <th className="text-right p-3 font-medium">تاريخ الإضافة</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 font-medium">{pkg.name}</td>
                  <td className="p-3">{Number(pkg.dailyPrice).toLocaleString()} د.ل</td>
                  <td className="p-3">{Number(pkg.weeklyPrice).toLocaleString()} د.ل</td>
                  <td className="p-3">{Number(pkg.monthlyPrice).toLocaleString()} د.ل</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      pkg.isActive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {pkg.isActive ? 'نشطة' : 'غير نشطة'}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--text-muted)]">
                    {new Date(pkg.createdAt).toLocaleDateString('ar-LY')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
