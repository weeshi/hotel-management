'use client';

import { Input, Select, Button } from '@/components/ui';
import { GuestSearchCombobox } from '@/components/guests';

interface Props {
  guestId?: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  adults: number;
  numChildren: number;
  onGuestIdChange?: (id: string | undefined) => void;
  onNameChange: (val: string) => void;
  onEmailChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
  onAdultsChange: (val: number) => void;
  onChildrenChange: (val: number) => void;
}

export function GuestInfoCard({
  guestId, guestName, guestEmail, guestPhone, adults, numChildren,
  onGuestIdChange, onNameChange, onEmailChange, onPhoneChange, onAdultsChange, onChildrenChange,
}: Props) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">👤 معلومات النزيل</h3>
        {guestId && (
          <span className="text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded-full">
            ✅ تم العثور على النزيل
          </span>
        )}
      </div>

      {!guestId && (
        <div className="mb-4">
          <GuestSearchCombobox
            placeholder="🔍 ابحث عن نزيل موجود..."
            onSelect={(guest) => {
              onGuestIdChange?.(guest.id);
              onNameChange(guest.name);
              onEmailChange(guest.email || '');
              onPhoneChange(guest.phone || '');
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="اسم النزيل" value={guestName} onChange={(e) => onNameChange(e.target.value)} placeholder="مثال: محمد علي" disabled={!!guestId} />
        <Input label="البريد الإلكتروني" type="email" value={guestEmail} onChange={(e) => onEmailChange(e.target.value)} placeholder="guest@example.com" disabled={!!guestId} />
        <Input label="رقم الهاتف" type="tel" value={guestPhone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="+218912345678" disabled={!!guestId} />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Select
          label="عدد البالغين"
          value={String(adults)}
          onChange={(v) => onAdultsChange(Number(v))}
          options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
        />
        <Select
          label="عدد الأطفال"
          value={String(numChildren)}
          onChange={(v) => onChildrenChange(Number(v))}
          options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
        />
      </div>

      {guestId && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <Button type="button" variant="ghost" size="sm" onClick={() => onGuestIdChange?.(undefined)}>
            ✕ إلغاء التحديد
          </Button>
        </div>
      )}
    </div>
  );
}
