'use client';

import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateGuestModal({ open, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    nationality: '',
    idNumber: '',
    notes: '',
  });
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads?subdir=guests', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) setIdDocumentUrl(data.data.url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body: Record<string, any> = { name: form.name };
    if (form.email) body.email = form.email;
    if (form.phone) body.phone = form.phone;
    if (form.address) body.address = form.address;
    if (form.nationality) body.nationality = form.nationality;
    if (form.idNumber) body.idNumber = form.idNumber;
    if (form.notes) body.notes = form.notes;
    if (idDocumentUrl) body.idDocumentUrl = idDocumentUrl;

    await apiPost('/api/admin/guests', body, {
      successMsg: '✅ تم إضافة النزيل',
      errorMsg: 'فشل إضافة النزيل',
      onSuccess: () => {
        setForm({ name: '', email: '', phone: '', address: '', nationality: '', idNumber: '', notes: '' });
        setIdDocumentUrl('');
        onSuccess();
        onClose();
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="👤 إضافة نزيل جديد">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="الاسم" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input label="رقم الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Input label="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <Input label="الجنسية" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
        <Input label="رقم الهوية" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} />
        <Input label="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">صورة الهوية / جواز السفر</label>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors text-sm text-[var(--text-muted)]">
              <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
              {uploading ? 'جاري الرفع...' : '📷 التقط صورة أو اختر ملف'}
            </label>
            {idDocumentUrl && (
              <div className="relative">
                <img src={idDocumentUrl} alt="صورة الهوية" className="w-16 h-16 object-cover rounded-lg border border-[var(--border)]" />
                <button type="button" onClick={() => setIdDocumentUrl('')} className="absolute -top-2 -right-2 bg-[var(--red)] text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">&times;</button>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Modal>
  );
}
