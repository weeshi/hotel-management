'use client';

import { useState, useEffect } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { apiMutation } from '@/lib/utils/api-mutation';

interface GuestData {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  nationality?: string | null;
  idNumber?: string | null;
  notes?: string | null;
  allowCredit?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  guest: GuestData | null;
  onSuccess: () => void;
}

export function EditGuestModal({ open, onClose, guest, onSuccess }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    nationality: '',
    idNumber: '',
    notes: '',
    allowCredit: false,
  });

  useEffect(() => {
    if (guest) {
      setForm({
        name: guest.name || '',
        email: guest.email || '',
        phone: guest.phone || '',
        address: guest.address || '',
        nationality: guest.nationality || '',
        idNumber: guest.idNumber || '',
        notes: guest.notes || '',
        allowCredit: guest.allowCredit || false,
      });
    }
  }, [guest]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guest) return;

    const body: Record<string, any> = {};
    if (form.name !== guest.name) body.name = form.name;
    if (form.email !== (guest.email || '')) body.email = form.email || undefined;
    if (form.phone !== (guest.phone || '')) body.phone = form.phone || undefined;
    if (form.address !== (guest.address || '')) body.address = form.address || undefined;
    if (form.nationality !== (guest.nationality || '')) body.nationality = form.nationality || undefined;
    if (form.idNumber !== (guest.idNumber || '')) body.idNumber = form.idNumber || undefined;
    if (form.notes !== (guest.notes || '')) body.notes = form.notes || undefined;
    if (form.allowCredit !== guest.allowCredit) body.allowCredit = form.allowCredit;

    await apiMutation({
      method: 'PUT',
      url: `/api/admin/guests/${guest.id}`,
      body,
      successMsg: '✅ تم تحديث بيانات النزيل',
      errorMsg: 'فشل تحديث بيانات النزيل',
      onSuccess: () => {
        onSuccess();
        onClose();
      },
    });
  }

  const isAdmin = user && ['ADMIN', 'MANAGER'].includes(user.role);

  return (
    <Modal open={open} onClose={onClose} title="✏️ تعديل بيانات النزيل">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="الاسم" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input label="رقم الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Input label="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <Input label="الجنسية" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
        <Input label="رقم الهوية" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} />
        <Input label="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        {isAdmin && (
          <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] cursor-pointer">
            <input type="checkbox" checked={form.allowCredit} onChange={e => setForm({ ...form, allowCredit: e.target.checked })}
              className="accent-[var(--gold)] w-5 h-5" />
            <div>
              <div className="text-sm font-medium">السماح بالائتمان</div>
              <div className="text-xs text-[var(--text-muted)]">يسمح للنزيل بترحيل الديون إلى المحفظة (رصيد دائن)</div>
            </div>
          </label>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">حفظ التعديلات</Button>
        </div>
      </form>
    </Modal>
  );
}
