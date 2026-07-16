'use client';

import { useState, useEffect } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { apiMutation } from '@/lib/utils/api-mutation';

interface Settings {
  logoUrl?: string | null;
  headerText?: string | null;
  footerText?: string | null;
  taxNumber?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReportSettingsModal({ open, onClose }: Props) {
  const [form, setForm] = useState<Settings>({});
  const [loading, setLoading] = useState(false);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reports/settings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setForm({
          logoUrl: data.data.logoUrl || '',
          headerText: data.data.headerText || '',
          footerText: data.data.footerText || '',
          taxNumber: data.data.taxNumber || '',
        });
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) fetchSettings(); }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await apiMutation({
      method: 'PUT',
      url: '/api/admin/reports/settings',
      body: {
        logoUrl: form.logoUrl || null,
        headerText: form.headerText || null,
        footerText: form.footerText || null,
        taxNumber: form.taxNumber || null,
      },
      successMsg: '✅ تم حفظ إعدادات التقرير',
      errorMsg: 'فشل حفظ الإعدادات',
      onSuccess: () => onClose(),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="⚙️ إعدادات التقرير" size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="رابط الشعار (URL)" value={form.logoUrl || ''} onChange={e => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" />
          <Input label="نص الرأس" value={form.headerText || ''} onChange={e => setForm({ ...form, headerText: e.target.value })} placeholder="اسم الفندق" />
          <Input label="نص التذييل" value={form.footerText || ''} onChange={e => setForm({ ...form, footerText: e.target.value })} placeholder="حقوق النشر..." />
          <Input label="الرقم الضريبي" value={form.taxNumber || ''} onChange={e => setForm({ ...form, taxNumber: e.target.value })} placeholder="123456789" />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
