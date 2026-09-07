'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface WebsiteSettings {
  id: string;
  isOnlineBookingEnabled: boolean;
  taxRate: number;
  bookingFee: number;
  discountPercent: number;
  confirmationCutoffHours: number;
}

const EMPTY_FORM: WebsiteSettings = {
  id: '',
  isOnlineBookingEnabled: false,
  taxRate: 0,
  bookingFee: 0,
  discountPercent: 0,
  confirmationCutoffHours: 48,
};

export default function AdminWebsiteSettingsPage() {
  const [form, setForm] = useState<WebsiteSettings>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/website-settings', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        setForm({
          id: data.data.id,
          isOnlineBookingEnabled: data.data.isOnlineBookingEnabled,
          taxRate: data.data.taxRate ?? 0,
          bookingFee: data.data.bookingFee ?? 0,
          discountPercent: data.data.discountPercent ?? 0,
          confirmationCutoffHours: data.data.confirmationCutoffHours ?? 48,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    await getCsrfToken();
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/website-settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          isOnlineBookingEnabled: form.isOnlineBookingEnabled,
          taxRate: Number(form.taxRate),
          bookingFee: Number(form.bookingFee),
          discountPercent: Number(form.discountPercent),
          confirmationCutoffHours: Number(form.confirmationCutoffHours),
        }),
      });
      const data = await res.json();
      setMessage(data.success ? 'تم حفظ الإعدادات بنجاح' : (data.error || 'فشل الحفظ'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-component="AdminWebsiteSettingsPage" className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">إعدادات الحجز عبر الموقع</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">تحكم في توفر الحجز أونلاين ورسوم الضريبة والخصم ومهلة تأكيد الحجوزات.</p>
      </div>

      {loading ? (
        <Card><p className="text-sm text-[var(--text-muted)]">جارٍ التحميل...</p></Card>
      ) : (
        <Card>
          <form onSubmit={saveSettings} className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
              <div>
                <p className="font-semibold text-sm">تفعيل الحجز عبر الموقع</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">عند التفعيل تظهر صفحة الحجز العامة وتُقبل الطلبات الإلكترونية.</p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, isOnlineBookingEnabled: !form.isOnlineBookingEnabled })}
                className={`relative w-12 h-7 rounded-full transition-colors ${form.isOnlineBookingEnabled ? 'bg-[var(--gold)]' : 'bg-[var(--border)]'}`}
                aria-pressed={form.isOnlineBookingEnabled}
              >
                <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${form.isOnlineBookingEnabled ? 'left-0.5' : 'left-[calc(100%-1.5rem-2px)]'}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="نسبة الضريبة (%)"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
              />
              <Input
                label="رسوم الحجز الثابتة"
                type="number"
                step="0.5"
                min="0"
                value={form.bookingFee}
                onChange={(e) => setForm({ ...form, bookingFee: Number(e.target.value) })}
              />
              <Input
                label="نسبة الخصم (%)"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })}
              />
              <Input
                label="مهلة تأكيد الحجز (ساعات)"
                type="number"
                min="1"
                value={form.confirmationCutoffHours}
                onChange={(e) => setForm({ ...form, confirmationCutoffHours: Number(e.target.value) })}
              />
            </div>

            {message && (
              <p className={`text-sm ${message.includes('نجاح') ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{message}</p>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
