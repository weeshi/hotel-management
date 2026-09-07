'use client';

import { Card } from '@/components/ui';

interface GuestDetail {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  nationality?: string | null;
  idNumber?: string | null;
  loyaltyPoints: number;
  notes?: string | null;
  createdAt: string;
  wallet?: { balance: number } | null;
  _count?: { bookings: number };
  idDocumentUrl?: string | null;
}

interface Props {
  guest: GuestDetail;
  onEdit: () => void;
}

export function GuestProfileHeader({ guest, onEdit }: Props) {
  return (
    <div className="grid md:grid-cols-3 gap-4 mb-6">
      <Card className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">معلومات النزيل</h3>
          <button onClick={onEdit} className="text-xs text-[var(--gold)] hover:underline">✏️ تعديل</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الاسم:</span><span className="font-medium">{guest.name}</span></div>
          {guest.email && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">البريد:</span><span dir="ltr" className="text-xs">{guest.email}</span></div>}
          {guest.phone && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الهاتف:</span><span>{guest.phone}</span></div>}
          {guest.nationality && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الجنسية:</span><span>{guest.nationality}</span></div>}
          {guest.idNumber && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">رقم الهوية:</span><span>{guest.idNumber}</span></div>}
          {guest.address && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">العنوان:</span><span className="text-xs">{guest.address}</span></div>}
        </div>
        {guest.idDocumentUrl && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--text-secondary)] mb-2">صورة الهوية:</div>
            <a href={guest.idDocumentUrl} target="_blank" rel="noopener noreferrer">
              <img src={guest.idDocumentUrl} alt="صورة الهوية" className="w-full max-w-[200px] rounded-lg border border-[var(--border)] hover:opacity-80 transition-opacity" />
            </a>
          </div>
        )}
      </Card>

      <Card className="!p-4">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">الولاء والمحفظة</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--text-secondary)]">نقاط الولاء:</span><span className="font-medium">{guest.loyaltyPoints}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-secondary)]">رصيد المحفظة:</span><span className="font-medium">{guest.wallet?.balance ?? 0} د.ل</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-secondary)]">إجمالي الحجوزات:</span><span>{guest._count?.bookings ?? 0}</span></div>
        </div>
      </Card>

      <Card className="!p-4">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">التواريخ</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--text-secondary)]">تاريخ التسجيل:</span><span>{new Date(guest.createdAt).toLocaleString('ar-LY')}</span></div>
        </div>
        {guest.notes && (
          <>
            <div className="border-t border-[var(--border)] my-3" />
            <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">ملاحظات</h3>
            <p className="text-sm text-[var(--text-secondary)]">{guest.notes}</p>
          </>
        )}
      </Card>
    </div>
  );
}
