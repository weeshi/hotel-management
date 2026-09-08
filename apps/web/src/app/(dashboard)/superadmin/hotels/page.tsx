'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Modal, Badge, EmptyState, Table } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/utils/api-client';
import { apiMutation } from '@/lib/utils/api-mutation';
import { addToast } from '@/lib/utils/toast';

interface HotelRow {
  id: string;
  name: string;
  nameAr?: string | null;
  customDomain?: string | null;
  createdAt: string;
  currency: string;
  usersCount: number;
  invitationsPending: number;
}

interface CreatedInvitation {
  hotel: { id: string; name: string };
  invitation: { id: string; email: string; role: string; expiresAt: string };
  invitationLink: string;
}

const emptyCreateForm = {
  name: '',
  nameAr: '',
  customDomain: '',
  address: '',
  phone: '',
  email: '',
  currency: 'LYD',
  managerEmail: '',
  managerName: '',
};

export default function SuperAdminHotelsPage() {
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [invitationResult, setInvitationResult] = useState<CreatedInvitation | null>(null);

  const [editingHotel, setEditingHotel] = useState<HotelRow | null>(null);
  const [editDomain, setEditDomain] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);

  async function fetchHotels() {
    setLoading(true);
    const res = await apiGet<HotelRow[]>('/api/superadmin/hotels');
    if (res.success) setHotels(res.data);
    else addToast('error', res.error?.message || 'فشل تحميل الفنادق');
    setLoading(false);
  }

  useEffect(() => { fetchHotels(); }, []);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', '✅ تم نسخ الرابط');
    } catch {
      addToast('error', 'تعذر نسخ الرابط');
    }
  }

  async function createHotel(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await apiPost<CreatedInvitation>('/api/superadmin/hotels', {
      hotel: {
        name: createForm.name,
        nameAr: createForm.nameAr || undefined,
        customDomain: createForm.customDomain || null,
        address: createForm.address || undefined,
        phone: createForm.phone || undefined,
        email: createForm.email || undefined,
        currency: createForm.currency,
      },
      manager: {
        email: createForm.managerEmail,
        name: createForm.managerName || undefined,
      },
    });
    setCreating(false);

    if (!res.success) {
      addToast('error', res.error?.message || 'فشل إنشاء الفندق');
      return;
    }

    addToast('success', '✅ تم إنشاء الفندق');
    setShowCreate(false);
    setCreateForm(emptyCreateForm);
    setInvitationResult(res.data);
    fetchHotels();
  }

  function openEditDomain(hotel: HotelRow) {
    setEditingHotel(hotel);
    setEditDomain(hotel.customDomain || '');
  }

  async function saveDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!editingHotel) return;
    setSavingDomain(true);
    const ok = await apiMutation({
      method: 'PATCH',
      url: `/api/superadmin/hotels/${editingHotel.id}`,
      body: { customDomain: editDomain.trim() === '' ? null : editDomain.trim() },
      successMsg: '✅ تم تحديث النطاق',
      errorMsg: 'فشل تحديث النطاق',
      onSuccess: () => {
        setEditingHotel(null);
        fetchHotels();
      },
    });
    if (ok) setSavingDomain(false);
    else setSavingDomain(false);
  }

  const columns = [
    {
      key: 'name',
      header: 'الفندق',
      render: (h: HotelRow) => (
        <div>
          <div className="font-semibold text-[var(--text-primary)]">{h.name}</div>
          {h.nameAr && <div className="text-xs text-[var(--text-muted)]" dir="rtl">{h.nameAr}</div>}
        </div>
      ),
    },
    {
      key: 'customDomain',
      header: 'الدومين',
      render: (h: HotelRow) =>
        h.customDomain ? (
          <Badge variant="green">{h.customDomain}</Badge>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">—</span>
        ),
    },
    {
      key: 'usersCount',
      header: 'المستخدمون',
      render: (h: HotelRow) => <span>{h.usersCount}</span>,
    },
    {
      key: 'invitationsPending',
      header: 'دعوات معلقة',
      render: (h: HotelRow) =>
        h.invitationsPending > 0 ? (
          <Badge variant="yellow">{h.invitationsPending}</Badge>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">0</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'تاريخ الإنشاء',
      render: (h: HotelRow) => (
        <span className="text-[var(--text-muted)] text-xs">
          {new Date(h.createdAt).toLocaleDateString('ar-LY')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'إجراءات',
      render: (h: HotelRow) => (
        <button
          onClick={() => openEditDomain(h)}
          className="text-xs text-[var(--blue)] hover:underline"
        >
          تعديل النطاق
        </button>
      ),
    },
  ];

  return (
    <div data-component="SuperAdminHotelsPage">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">🏨 فنادق المنصة</h2>
        <Button onClick={() => setShowCreate(true)}>+ إنشاء فندق</Button>
      </div>

      {hotels.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon="🏨"
            title="لا توجد فنادق بعد"
            description="ابدأ بإنشاء أول فندق وستصلك دعوة الانضمام الخاصة بمديره"
            action={<Button onClick={() => setShowCreate(true)}>+ إنشاء فندق</Button>}
          />
        </Card>
      ) : (
        <Table
          columns={columns}
          data={hotels}
          keyExtractor={(h) => h.id}
          loading={loading}
          emptyMessage="لا توجد فنادق بعد"
        />
      )}

      {/* Create hotel modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إنشاء فندق جديد" size="lg">
        <form onSubmit={createHotel} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="اسم الفندق *"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
              placeholder="فندق السلام"
            />
            <Input
              label="الاسم بالعربية (اختياري)"
              value={createForm.nameAr}
              onChange={(e) => setCreateForm({ ...createForm, nameAr: e.target.value })}
              placeholder="فندق السلام"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="الدومين المخصص (اختياري)"
              value={createForm.customDomain}
              onChange={(e) => setCreateForm({ ...createForm, customDomain: e.target.value })}
              placeholder="booking.alsalam-hotel.ly"
              dir="ltr"
            />
            <Input
              label="العملة"
              value={createForm.currency}
              onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
              placeholder="LYD"
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="العنوان (اختياري)"
              value={createForm.address}
              onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
              placeholder="طرابلس، ليبيا"
            />
            <Input
              label="الهاتف (اختياري)"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              placeholder="+218 21 000 0000"
              dir="ltr"
            />
          </div>

          <Input
            label="بريد الفندق (اختياري)"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            placeholder="info@alsalam-hotel.ly"
            dir="ltr"
          />

          <div className="border-t border-[var(--border)] pt-4">
            <div className="text-sm font-bold text-[var(--gold)] mb-3">👤 مدير الفندق (يستلم الدعوة)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="البريد الإلكتروني *"
                type="email"
                value={createForm.managerEmail}
                onChange={(e) => setCreateForm({ ...createForm, managerEmail: e.target.value })}
                required
                placeholder="manager@alsalam-hotel.ly"
                dir="ltr"
              />
              <Input
                label="الاسم (اختياري)"
                value={createForm.managerName}
                onChange={(e) => setCreateForm({ ...createForm, managerName: e.target.value })}
                placeholder="محمد أحمد"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button type="submit" loading={creating}>إنشاء</Button>
          </div>
        </form>
      </Modal>

      {/* Invitation link success modal */}
      <Modal
        open={!!invitationResult}
        onClose={() => setInvitationResult(null)}
        title="🎉 تم إنشاء الفندق — شارك دعوة المدير"
      >
        {invitationResult && (
          <div className="space-y-4">
            <div className="bg-[rgba(46,204,113,0.08)] border border-[var(--green)]/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{invitationResult.hotel.name}</span>
                <Badge variant="green">نشط</Badge>
              </div>
              <p className="text-xs text-[var(--text-secondary)]" dir="ltr">
                {invitationResult.invitation.email}
              </p>
            </div>

            <div>
              <div className="text-xs font-bold text-[var(--gold)] mb-2">🔗 رابط الدعوة (ينتهي خلال 7 أيام)</div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={invitationResult.invitationLink}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:outline-none"
                  dir="ltr"
                />
                <Button size="sm" onClick={() => copyToClipboard(invitationResult.invitationLink)}>
                  📋 نسخ
                </Button>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-2">
                الرابط مبني على نطاق المنصة الرئيسي ويعمل فورًا — حتى قبل اكتمال إعداد دومين الفندق.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => { setInvitationResult(null); window.open(invitationResult.invitationLink, '_blank'); }}
              >
                فتح الرابط
              </Button>
              <Button type="button" onClick={() => setInvitationResult(null)}>تم</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit domain modal */}
      <Modal
        open={!!editingHotel}
        onClose={() => setEditingHotel(null)}
        title={`تعديل النطاق — ${editingHotel?.name || ''}`}
      >
        <form onSubmit={saveDomain} className="space-y-4">
          <Input
            label="الدومين المخصص"
            value={editDomain}
            onChange={(e) => setEditDomain(e.target.value)}
            placeholder="booking.alsalam-hotel.ly"
            dir="ltr"
          />
          <p className="text-xs text-[var(--text-muted)]">
            اتركه فارغًا لإزالة النطاق. يُطبع الدومين بأحرف صغيرة ويُطابق تمامًا (exact match).
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditingHotel(null)}>إلغاء</Button>
            <Button type="submit" loading={savingDomain}>حفظ</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
