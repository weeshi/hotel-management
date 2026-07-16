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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body: Record<string, any> = { name: form.name };
    if (form.email) body.email = form.email;
    if (form.phone) body.phone = form.phone;
    if (form.address) body.address = form.address;
    if (form.nationality) body.nationality = form.nationality;
    if (form.idNumber) body.idNumber = form.idNumber;
    if (form.notes) body.notes = form.notes;

    await apiPost('/api/admin/guests', body, {
      successMsg: '✅ تم إضافة النزيل',
      errorMsg: 'فشل إضافة النزيل',
      onSuccess: () => {
        setForm({ name: '', email: '', phone: '', address: '', nationality: '', idNumber: '', notes: '' });
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
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Modal>
  );
}
