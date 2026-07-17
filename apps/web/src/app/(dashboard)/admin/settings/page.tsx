'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { apiPut } from '@/lib/utils/api-mutation';

interface HotelSettings {
  name: string; nameAr: string; address: string; phone: string;
  email: string; currency: string; checkInTime: string; checkOutTime: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<HotelSettings>({
    name: '', nameAr: '', address: '', phone: '',
    email: '', currency: 'LYD', checkInTime: '14:00', checkOutTime: '12:00',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchSettings() {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSettings({
          name: data.data.name || '',
          nameAr: data.data.nameAr || '',
          address: data.data.address || '',
          phone: data.data.phone || '',
          email: data.data.email || '',
          currency: data.data.currency || 'LYD',
          checkInTime: data.data.checkInTime || '14:00',
          checkOutTime: data.data.checkOutTime || '12:00',
        });
      }
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { fetchSettings(); }, []);

  function updateField(field: string, value: string) {
    setSettings({ ...settings, [field]: value });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...settings, name: settings.name || settings.nameAr || '' };
    await apiPut('/api/admin/settings', payload, {
      successMsg: '✅ تم حفظ الإعدادات بنجاح',
      errorMsg: '❌ فشل حفظ الإعدادات',
      onSuccess: () => setSaving(false),
    });
    setSaving(false);
  }

  if (loading) return (
    <div data-component="AdminSettingsPage">
      <h1 className="text-2xl font-bold mb-6">⚙️ إعدادات الفندق</h1>
      <div className="text-center py-12 text-[var(--text-muted)]">جاري التحميل...</div>
    </div>
  );

  return (
    <div data-component="AdminSettingsPage">
      <h1 className="text-2xl font-bold mb-6">⚙️ إعدادات الفندق</h1>

      <Card>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="اسم الفندق (عربي)" value={settings.nameAr} onChange={(e) => updateField('nameAr', e.target.value)} />
            <Input label="اسم الفندق (إنجليزي)" value={settings.name} onChange={(e) => updateField('name', e.target.value)} />
            <Input label="العنوان" value={settings.address} onChange={(e) => updateField('address', e.target.value)} />
            <Input label="الهاتف" value={settings.phone} onChange={(e) => updateField('phone', e.target.value)} />
            <Input label="البريد الإلكتروني" type="email" value={settings.email} onChange={(e) => updateField('email', e.target.value)} />
            <Input label="العملة" value={settings.currency} onChange={(e) => updateField('currency', e.target.value)} />
            <Input label="وقت الدخول" value={settings.checkInTime} onChange={(e) => updateField('checkInTime', e.target.value)} />
            <Input label="وقت الخروج" value={settings.checkOutTime} onChange={(e) => updateField('checkOutTime', e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : '💾 حفظ الإعدادات'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
