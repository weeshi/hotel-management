'use client';

import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    name: 'فندق السلام',
    nameAr: 'فندق السلام',
    address: 'طرابلس، ليبيا',
    phone: '+218-21-1234567',
    email: 'info@hotel-salam.ly',
    currency: 'LYD',
    checkInTime: '14:00',
    checkOutTime: '12:00',
  });

  function updateField(field: string, value: string) {
    setSettings({ ...settings, [field]: value });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // TODO: implement save
  }

  return (
    <div>
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
            <Button type="submit">💾 حفظ الإعدادات</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
