'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Input, Select } from '@/components/ui';
import { showErrorModal } from '@/components/ui/error-modal';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { ServicesCard } from '@/components/bookings/ServicesCard';
import type { Booking } from './types';

interface Props {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
  onMoveRoom: (booking: Booking) => void;
}

export function EditBookingModal({ open, booking, onClose, onSaved, onMoveRoom }: Props) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      const room = booking.rooms?.[0];
      if (room?.checkIn) setCheckIn(typeof room.checkIn === 'string' ? room.checkIn.split('T')[0] : '');
      if (room?.checkOut) setCheckOut(typeof room.checkOut === 'string' ? room.checkOut.split('T')[0] : '');
      setAdults(booking.adults ?? 1);
      setChildren(booking.children ?? 0);

      const svcMap: Record<string, number> = {};
      for (const bs of booking.bookingServices || []) {
        svcMap[bs.serviceId] = (svcMap[bs.serviceId] || 0) + bs.quantity;
      }
      setSelectedServices(svcMap);
    }
  }, [booking]);

  const isCheckedin = booking?.status === 'CHECKED_IN';

  async function handleSave() {
    if (!booking) return;
    setSaving(true);
    try {
      await getCsrfToken();
      const body: Record<string, any> = {};
      if (checkIn) body.checkIn = checkIn;
      if (checkOut) body.checkOut = checkOut;
      body.adults = adults;
      body.children = children;

      const servicesPayload = Object.entries(selectedServices)
        .filter(([_, qty]) => qty > 0)
        .map(([serviceId, quantity]) => ({ serviceId, quantity }));
      body.services = servicesPayload;

      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        showErrorModal(data.error || 'فشل التعديل');
      }
    } catch {
      showErrorModal('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  if (!booking) return null;

  return (
    <Modal open={open} onClose={onClose} title="✏️ تعديل الحجز" size="lg">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>الحالة:</strong> {booking.status === 'CONFIRMED' ? 'مؤكد' : booking.status === 'CHECKED_IN' ? 'مقيم' : booking.status}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="تاريخ الوصول"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
          <Input
            label="تاريخ المغادرة"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="عدد البالغين"
            value={String(adults)}
            onChange={(e) => setAdults(Number(e.target.value))}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          />
          <Select
            label="عدد الأطفال"
            value={String(children)}
            onChange={(e) => setChildren(Number(e.target.value))}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>

        <div className="bg-[var(--bg-primary)] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] block mb-1">الغرفة الحالية</span>
              <span className="font-bold text-base">{booking.rooms?.[0]?.room?.roomNumber || '—'}</span>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => onMoveRoom(booking)}>
              🚚 نقل غرفة
            </Button>
          </div>
        </div>

        <div className="border border-[var(--border)] rounded-xl p-4">
          <h4 className="font-bold text-sm mb-3">🛎️ الخدمات</h4>
          {isCheckedin && (
            <p className="text-xs text-[var(--text-muted)] mb-3">
              ⓘ الخدمات الجديدة ستُضاف كرسوم على الفاتورة النشطة
            </p>
          )}
          <ServicesCard
            selectedServices={selectedServices}
            onServicesChange={setSelectedServices}
          />
        </div>

        <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-primary)] p-3 rounded-lg">
          ⓘ تعديل اسم النزيل ورقم الهاتف يتم من خلال <strong>وحدة إدارة النزلاء</strong> المخصصة للحفاظ على تكامل البيانات
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
