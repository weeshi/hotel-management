'use client';

import { useState, useEffect } from 'react';
import { Modal, Select, Input, Button } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { addToast } from '@/lib/utils/toast';

// --- Types ---

interface BookingOption {
  id: string;
  bookingNo: string;
  guestName: string;
  roomNumber: string;
}

interface PackageOption {
  id: string;
  name: string;
  dailyPrice: number;
  weeklyPrice: number;
  monthlyPrice: number;
}

type OwnershipMode = 'booking' | 'external';
type RentalDuration = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface CreateSafeBoxModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DURATION_LABELS: Record<RentalDuration, string> = {
  DAILY: '📅 يومي',
  WEEKLY: '📅 أسبوعي',
  MONTHLY: '📅 شهري',
};

// --- Component ---

export function CreateSafeBoxModal({ open, onClose, onSuccess }: CreateSafeBoxModalProps) {
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>('booking');
  const [bookingId, setBookingId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [externalName, setExternalName] = useState('');
  const [externalPhone, setExternalPhone] = useState('');
  const [externalIdNumber, setExternalIdNumber] = useState('');
  const [packageId, setPackageId] = useState('');
  const [rentalDuration, setRentalDuration] = useState<RentalDuration>('DAILY');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ description: string; quantity: number; notes: string }[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [fetchingBookings, setFetchingBookings] = useState(false);
  const [fetchingPackages, setFetchingPackages] = useState(false);

  // --- Fetch active bookings when modal opens ---
  useEffect(() => {
    if (!open) return;
    setFetchingBookings(true);
    const token = localStorage.getItem('accessToken');
    fetch('/api/admin/bookings?status=CHECKED_IN', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const mapped: BookingOption[] = data.data.map((b: any) => ({
            id: b.id,
            bookingNo: b.bookingNo,
            guestName: b.guest?.name || b.guestName || '—',
            roomNumber: b.rooms?.[0]?.room?.roomNumber || '',
          }));
          setBookings(mapped);
        }
      })
      .finally(() => setFetchingBookings(false));
  }, [open]);

  // --- Fetch active packages when modal opens ---
  useEffect(() => {
    if (!open) return;
    setFetchingPackages(true);
    const token = localStorage.getItem('accessToken');
    fetch('/api/admin/settings/safebox-packages?isActive=true', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPackages(data.data);
          if (data.data.length > 0) setPackageId(data.data[0].id);
        }
      })
      .finally(() => setFetchingPackages(false));
  }, [open]);

  // --- Reset form on open ---
  useEffect(() => {
    if (!open) return;
    setOwnershipMode('booking');
    setBookingId('');
    setRoomId('');
    setExternalName('');
    setExternalPhone('');
    setExternalIdNumber('');
    setPackageId('');
    setRentalDuration('DAILY');
    setNotes('');
    setItems([]);
  }, [open]);

  // --- Auto-fill roomId when booking changes ---
  function handleBookingChange(id: string) {
    setBookingId(id);
    const booking = bookings.find((b) => b.id === id);
    if (booking) {
      setRoomId(booking.roomNumber || '');
    } else {
      setRoomId('');
    }
  }

  // --- Dynamic price calculation ---
  const selectedPackage = packages.find((p) => p.id === packageId);
  const calculatedFee = selectedPackage
    ? rentalDuration === 'DAILY'
      ? Number(selectedPackage.dailyPrice)
      : rentalDuration === 'WEEKLY'
        ? Number(selectedPackage.weeklyPrice)
        : Number(selectedPackage.monthlyPrice)
    : 0;

  // --- Items helpers ---
  function addItem() {
    setItems([...items, { description: '', quantity: 1, notes: '' }]);
  }

  function updateItem(i: number, field: string, value: any) {
    const copy = [...items];
    (copy[i] as any)[field] = value;
    setItems(copy);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  // --- Submit ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await getCsrfToken();

    try {
      let resolvedExternalClientId: string | undefined;

      // --- If external client mode, create the client first ---
      if (ownershipMode === 'external') {
        if (!externalName.trim()) {
          addToast('error', 'اسم العميل الخارجي مطلوب');
          setSaving(false);
          return;
        }
        const clientRes = await fetch('/api/admin/external-clients', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json',
            ...csrfHeaders(),
          },
          body: JSON.stringify({
            name: externalName.trim(),
            phone: externalPhone.trim() || undefined,
            idNumber: externalIdNumber.trim() || undefined,
          }),
        });
        const clientData = await clientRes.json();
        if (!clientData.success) {
          addToast('error', clientData.error?.message || 'فشل إنشاء العميل الخارجي');
          setSaving(false);
          return;
        }
        resolvedExternalClientId = clientData.data.id;
      }

      // --- Validate package ---
      if (!packageId) {
        addToast('error', 'يرجى اختيار باقة التسعير');
        setSaving(false);
        return;
      }

      // --- Create safe box ---
      const body: Record<string, any> = {
        packageId,
        rentalDuration,
        notes: notes || undefined,
        items: items.length ? items.map((it) => ({ description: it.description, quantity: it.quantity, notes: it.notes || undefined })) : undefined,
      };

      if (ownershipMode === 'booking') {
        if (!bookingId) {
          addToast('error', 'يرجى اختيار الحجز');
          setSaving(false);
          return;
        }
        body.bookingId = bookingId;
      } else {
        body.externalClientId = resolvedExternalClientId;
      }

      const res = await fetch('/api/admin/safeboxes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        addToast('success', '✅ تم فتح صندوق الأمانات');
        onSuccess();
        onClose();
      } else {
        addToast('error', data.error?.message || 'فشل فتح صندوق الأمانات');
      }
    } catch {
      addToast('error', 'حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🔐 فتح صندوق أمانات جديد" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* --- Ownership Toggle --- */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">نوع العميل</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOwnershipMode('booking')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                ownershipMode === 'booking'
                  ? 'bg-[var(--gold)] text-black'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              🏨 نزيل فندق
            </button>
            <button
              type="button"
              onClick={() => setOwnershipMode('external')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                ownershipMode === 'external'
                  ? 'bg-[var(--gold)] text-black'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              👤 عميل خارجي
            </button>
          </div>
        </div>

        {/* --- Hotel Guest Mode --- */}
        {ownershipMode === 'booking' && (
          <>
            <Select
              label="الحجز النشط"
              value={bookingId}
              onChange={(e) => handleBookingChange(e.target.value)}
              placeholder={fetchingBookings ? 'جاري التحميل...' : 'اختر الحجز'}
              options={bookings.map((b) => ({
                value: b.id,
                label: `${b.bookingNo} - ${b.guestName}${b.roomNumber ? ` (غرفة ${b.roomNumber})` : ''}`,
              }))}
            />
            {roomId && (
              <Input label="الغرفة (تعبئة تلقائية)" value={roomId} disabled />
            )}
          </>
        )}

        {/* --- External Client Mode --- */}
        {ownershipMode === 'external' && (
          <div className="space-y-3 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
            <h4 className="text-sm font-bold">بيانات العميل الخارجي</h4>
            <Input
              label="الاسم"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              placeholder="اسم العميل"
              required
            />
            <Input
              label="رقم الهاتف"
              value={externalPhone}
              onChange={(e) => setExternalPhone(e.target.value)}
              placeholder="اختياري"
            />
            <Input
              label="رقم الهوية"
              value={externalIdNumber}
              onChange={(e) => setExternalIdNumber(e.target.value)}
              placeholder="اختياري"
            />
          </div>
        )}

        {/* --- Package Selection --- */}
        <Select
          label="باقة التسعير"
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          placeholder={fetchingPackages ? 'جاري التحميل...' : 'اختر الباقة'}
          options={packages.map((p) => ({
            value: p.id,
            label: `${p.name} — يومي ${Number(p.dailyPrice).toLocaleString()} / أسبوعي ${Number(p.weeklyPrice).toLocaleString()} / شهري ${Number(p.monthlyPrice).toLocaleString()} د.ل`,
          }))}
        />

        {/* --- Duration Selection --- */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">مدة الإيجار</label>
          <div className="flex gap-2">
            {(['DAILY', 'WEEKLY', 'MONTHLY'] as RentalDuration[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRentalDuration(d)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  rentalDuration === d
                    ? 'bg-[var(--gold)] text-black'
                    : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
                }`}
              >
                {DURATION_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* --- Price Preview --- */}
        {selectedPackage && calculatedFee > 0 && (
          <div className="p-4 bg-[var(--gold)]/5 border border-[var(--gold)]/20 rounded-xl">
            <p className="text-sm text-center">
              سيتم تسجيل رسوم بقيمة{' '}
              <strong className="text-lg">{calculatedFee.toLocaleString()} د.ل</strong>
              {' '}على {ownershipMode === 'booking' ? 'حساب الحجز' : 'فاتورة العميل'}
            </p>
          </div>
        )}

        {/* --- Notes --- */}
        <Input
          label="ملاحظات"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="اختياري"
        />

        {/* --- Items --- */}
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold">العناصر المودعة</h4>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>+ إضافة عنصر</Button>
          </div>
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-start mb-2 p-3 bg-[var(--bg-card)] rounded-lg">
              <div className="flex-1">
                <Input
                  placeholder="وصف العنصر"
                  value={item.description}
                  onChange={(e) => updateItem(i, 'description', e.target.value)}
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min={1}
                  value={String(item.quantity)}
                  onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
                />
              </div>
              <button type="button" onClick={() => removeItem(i)} className="text-[var(--red)] mt-2 text-lg">&times;</button>
            </div>
          ))}
        </div>

        {/* --- Actions --- */}
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'جاري الفتح...' : 'فتح الصندوق'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
