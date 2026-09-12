'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Select, Modal } from '@/components/ui';
import { apiGet, apiPost, apiPatch } from '@/lib/utils/api-client';
import { addToast } from '@/lib/utils/toast';

const PROVIDERS = [
  { value: 'BOOKING_COM', label: '🌐 Booking.com' },
  { value: 'EXPEDIA', label: '✈️ Expedia' },
  { value: 'AIRBNB', label: '🏠 Airbnb' },
  { value: 'AGODA', label: '📙 Agoda' },
  { value: 'TRIP', label: '💼 Trip.com' },
  { value: 'OTHER', label: '🔌 أخرى' },
];

interface Mapping {
  id: string;
  provider: string;
  channelRoomTypeId: string;
  channelRatePlanId: string | null;
  channelName: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeNameAr: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  enabled: boolean;
  lastPushedAt: string | null;
  createdAt: string;
}

interface RoomType {
  id: string;
  name: string;
  nameAr: string | null;
}

interface RatePlan {
  id: string;
  name: string;
  nameAr: string | null;
  roomTypeId: string;
}

interface SnapshotRow {
  date: string;
  roomTypeId: string;
  available: number;
  nightlyRate: number;
}

const emptyForm = {
  provider: 'BOOKING_COM',
  channelRoomTypeId: '',
  channelName: '',
  channelRatePlanId: '',
  roomTypeId: '',
  ratePlanId: '',
  enabled: true,
};

const providerLabel = (v: string) => PROVIDERS.find((p) => p.value === v)?.label.split(' ')[0] || v;

export default function ChannelManagerPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editMapping, setEditMapping] = useState<Mapping | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [preview, setPreview] = useState<{
    rows: SnapshotRow[];
    provider: string;
    from: string;
    to: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function fetchAll() {
    const [mRes, rtRes, rpRes] = await Promise.all([
      apiGet<Mapping[]>('/api/admin/channel-manager/mappings'),
      apiGet<RoomType[]>('/api/admin/room-types'),
      apiGet<RatePlan[]>('/api/admin/rate-plans'),
    ]);
    if (mRes.success) setMappings(mRes.data);
    if (rtRes.success) setRoomTypes(rtRes.data);
    if (rpRes.success) setRatePlans(rpRes.data);
  }

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();
  }, []);

  async function createMapping() {
    if (!form.roomTypeId || !form.channelRoomTypeId) {
      addToast('error', 'اختر نوع الغرفة المحلي وأدخل معرّف غرفة القناة');
      return;
    }
    setSaving(true);
    const res = await apiPost('/api/admin/channel-manager/mappings', {
      provider: form.provider,
      channelRoomTypeId: form.channelRoomTypeId.trim(),
      channelName: form.channelName.trim() || undefined,
      channelRatePlanId: form.channelRatePlanId.trim() || undefined,
      roomTypeId: form.roomTypeId,
      ratePlanId: form.ratePlanId || undefined,
      enabled: form.enabled,
    });
    if (res.success) {
      addToast('success', '✅ تم إضافة الربط');
      setCreateOpen(false);
      setForm(emptyForm);
      fetchAll();
    } else {
      addToast('error', res.error?.message || 'فشل إضافة الربط');
    }
    setSaving(false);
  }

  function openEdit(m: Mapping) {
    setEditMapping(m);
    setEditForm({
      provider: m.provider,
      channelRoomTypeId: m.channelRoomTypeId,
      channelName: m.channelName || '',
      channelRatePlanId: m.channelRatePlanId || '',
      roomTypeId: m.roomTypeId,
      ratePlanId: m.ratePlanId || '',
      enabled: m.enabled,
    });
  }

  async function saveEdit() {
    if (!editMapping) return;
    setSavingEdit(true);
    const res = await apiPatch(`/api/admin/channel-manager/mappings/${editMapping.id}`, {
      provider: editForm.provider,
      channelRoomTypeId: editForm.channelRoomTypeId.trim(),
      channelName: editForm.channelName.trim() || undefined,
      channelRatePlanId: editForm.channelRatePlanId.trim() || undefined,
      roomTypeId: editForm.roomTypeId,
      ratePlanId: editForm.ratePlanId || undefined,
      enabled: editForm.enabled,
    });
    if (res.success) {
      addToast('success', '💾 تم حفظ التغييرات');
      setEditMapping(null);
      fetchAll();
    } else {
      addToast('error', res.error?.message || 'فشل حفظ التغييرات');
    }
    setSavingEdit(false);
  }

  async function toggleEnabled(m: Mapping) {
    const res = await apiPatch(`/api/admin/channel-manager/mappings/${m.id}`, { enabled: !m.enabled });
    if (res.success) {
      addToast('success', m.enabled ? '⛔ تم إيقاف الربط' : '✅ تم تفعيل الربط');
      fetchAll();
    } else {
      addToast('error', res.error?.message || 'فشل التحديث');
    }
  }

  async function loadPreview(provider: string, from: string, to: string) {
    setPreviewLoading(true);
    const res = await apiGet<SnapshotRow[]>(
      `/api/admin/channel-manager/preview?provider=${provider}&from=${from}&to=${to}`
    );
    setPreviewLoading(false);
    if (res.success) {
      setPreview({ rows: res.data, provider, from, to });
    } else {
      addToast('error', res.error?.message || 'فشل توليد المعاينة');
    }
  }

  async function publish() {
    if (!preview) return;
    setPublishing(true);
    const res = await apiPost('/api/admin/channel-manager/publish', {
      provider: preview.provider,
      from: preview.from,
      to: preview.to,
    });
    setPublishing(false);
    if (res.success) {
      addToast('success', `🚀 تم نشر ${res.data.published} سجل توفر`);
    } else {
      addToast('error', res.error?.message || 'فشل النشر');
    }
  }

  const roomTypeName = (id: string) => {
    const rt = roomTypes.find((r) => r.id === id);
    return rt ? (rt.nameAr || rt.name) : id;
  };

  const ratePlanName = (id: string | null) => {
    if (!id) return '—';
    const rp = ratePlans.find((r) => r.id === id);
    return rp ? (rp.nameAr || rp.name) : id;
  };

  return (
    <div data-component="ChannelManagerPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📡 مدير القنوات (OTA)</h1>
        <Button onClick={() => setCreateOpen(true)}>➕ ربط جديد</Button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-6 text-sm" data-component="ChannelUsage">
        <div className="font-bold text-[var(--gold)] mb-2">🔁 كيف يعمل الربط</div>
        <ul className="text-xs text-[var(--text-muted)] list-disc list-inside space-y-1">
          <li>اربط معرّف كل نوع غرفة/خطة سعر من القناة (OTA) بنوع الغرفة المحلي.</li>
          <li>«معاينة» تولّد التوفر والسعر لكل ليلة (ناقص المحجوز والمعلّق).</li>
          <li>«نشر» يحفظ اللقطة ويدفعها لمزامنة الأسعار والتوفر تلقائياً.</li>
          <li>حجوزات القنوات الواردة تُحَلّ عبر الربط وتُحقن كحجوزات مؤكدة (مصدر PARTNER).</li>
        </ul>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--text-muted)]">جاري التحميل...</div>
      ) : mappings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center text-[var(--text-muted)]">
          لا توجد روابط قنوات بعد — اضغط «ربط جديد» لتوصيل أول قناة
        </div>
      ) : (
        <div className="grid gap-3">
          {mappings.map((m) => (
            <div key={m.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4" data-component={`MappingCard-${m.channelRoomTypeId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{PROVIDERS.find((p) => p.value === m.provider)?.label.split(' ')[0]}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{m.channelName || m.channelRoomTypeId}</span>
                      <code className="text-[10px] bg-black/40 rounded px-1.5 py-0.5" dir="ltr">{m.channelRoomTypeId}</code>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      ← {roomTypeName(m.roomTypeId)} · السعر: {ratePlanName(m.ratePlanId)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.enabled ? 'green' : 'red'}>{m.enabled ? 'مفعّل' : 'موقوف'}</Badge>
                  <Badge>{m.provider}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="secondary" size="sm" onClick={() => openEdit(m)}>✏️ تعديل</Button>
                <Button variant="secondary" size="sm" onClick={() => toggleEnabled(m)}>
                  {m.enabled ? '⛔ إيقاف' : '✅ تفعيل'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Availability preview + publish */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mt-8" data-component="AvailabilityPreview">
        <h2 className="font-bold mb-4">📊 معاينة ونشر التوفر والأسعار</h2>
        <div className="grid gap-3 sm:grid-cols-3 mb-3">
          <Select
            id="prev-provider"
            label="القناة"
            options={PROVIDERS}
            value={preview?.provider || 'BOOKING_COM'}
            onChange={(e) => setPreview((p) => ({ ...(p || { rows: [], from: '', to: '' }), provider: e.target.value }))}
          />
          <Input id="prev-from" label="من تاريخ" type="date" value={preview?.from || ''} onChange={(e) => setPreview((p) => ({ ...(p || { rows: [], provider: 'BOOKING_COM', to: '' }), from: e.target.value }))} />
          <Input id="prev-to" label="إلى تاريخ" type="date" value={preview?.to || ''} onChange={(e) => setPreview((p) => ({ ...(p || { rows: [], provider: 'BOOKING_COM', from: '' }), to: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            loading={previewLoading}
            onClick={() => preview && loadPreview(preview.provider, preview.from, preview.to)}
          >
            🔍 معاينة
          </Button>
          <Button loading={publishing} onClick={publish}>🚀 نشر</Button>
        </div>

        {preview && preview.rows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="text-right py-2">التاريخ</th>
                  <th className="text-right py-2">نوع الغرفة</th>
                  <th className="text-right py-2">التوفر</th>
                  <th className="text-right py-2">السعر/ليلة</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={`${r.date}-${r.roomTypeId}`} className="border-b border-[var(--border)]/50">
                    <td className="py-1.5">{new Date(r.date + 'T00:00:00').toLocaleDateString('ar-LY')}</td>
                    <td className="py-1.5">{roomTypeName(r.roomTypeId)}</td>
                    <td className="py-1.5">
                      <Badge variant={r.available > 0 ? 'green' : 'red'}>{r.available}</Badge>
                    </td>
                    <td className="py-1.5 font-bold text-[var(--gold)]">{r.nightlyRate} د.ل</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <Modal open onClose={() => setCreateOpen(false)} title="🔗 ربط قناة جديدة">
          <div className="space-y-4">
            <Select
              id="cm-provider"
              label="القناة (OTA)"
              options={PROVIDERS}
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            />
            <Input id="cm-crt" label="معرّف نوع الغرفة في القناة" placeholder="مثال: DBLX1" dir="ltr" value={form.channelRoomTypeId} onChange={(e) => setForm({ ...form, channelRoomTypeId: e.target.value })} />
            <Input id="cm-cname" label="اسم الغرفة كما تظهر في القناة (اختياري)" value={form.channelName} onChange={(e) => setForm({ ...form, channelName: e.target.value })} />
            <Input id="cm-crp" label="معرّف خطة السعر في القناة (اختياري)" dir="ltr" value={form.channelRatePlanId} onChange={(e) => setForm({ ...form, channelRatePlanId: e.target.value })} />
            <Select
              id="cm-rt"
              label="نوع الغرفة المحلي"
              options={roomTypes.map((r) => ({ value: r.id, label: r.nameAr || r.name }))}
              value={form.roomTypeId}
              onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}
            />
            <Select
              id="cm-rp"
              label="خطة السعر المحلية (اختياري)"
              options={[
                { value: '', label: '— بدون خطة (سعر قاعدة الغرفة) —' },
                ...ratePlans
                  .filter((p) => !form.roomTypeId || p.roomTypeId === form.roomTypeId)
                  .map((p) => ({ value: p.id, label: p.nameAr || p.name })),
              ]}
              value={form.ratePlanId}
              onChange={(e) => setForm({ ...form, ratePlanId: e.target.value })}
            />
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span>مفعّل فوراً</span>
            </div>
            <div className="flex gap-2 mt-6">
              <Button loading={saving} onClick={createMapping} className="flex-1">💾 حفظ</Button>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editMapping && (
        <Modal open onClose={() => setEditMapping(null)} title={`✏️ تعديل ${editMapping.channelRoomTypeId}`}>
          <div className="space-y-4">
            <Select
              id="cm-e-provider"
              label="القناة (OTA)"
              options={PROVIDERS}
              value={editForm.provider}
              onChange={(e) => setEditForm({ ...editForm, provider: e.target.value })}
            />
            <Input id="cm-e-crt" label="معرّف نوع الغرفة في القناة" dir="ltr" value={editForm.channelRoomTypeId} onChange={(e) => setEditForm({ ...editForm, channelRoomTypeId: e.target.value })} />
            <Input id="cm-e-cname" label="اسم الغرفة في القناة" value={editForm.channelName} onChange={(e) => setEditForm({ ...editForm, channelName: e.target.value })} />
            <Input id="cm-e-crp" label="معرّف خطة السعر في القناة" dir="ltr" value={editForm.channelRatePlanId} onChange={(e) => setEditForm({ ...editForm, channelRatePlanId: e.target.value })} />
            <Select
              id="cm-e-rt"
              label="نوع الغرفة المحلي"
              options={roomTypes.map((r) => ({ value: r.id, label: r.nameAr || r.name }))}
              value={editForm.roomTypeId}
              onChange={(e) => setEditForm({ ...editForm, roomTypeId: e.target.value })}
            />
            <Select
              id="cm-e-rp"
              label="خطة السعر المحلية"
              options={[
                { value: '', label: '— بدون خطة —' },
                ...ratePlans
                  .filter((p) => !editForm.roomTypeId || p.roomTypeId === editForm.roomTypeId)
                  .map((p) => ({ value: p.id, label: p.nameAr || p.name })),
              ]}
              value={editForm.ratePlanId}
              onChange={(e) => setEditForm({ ...editForm, ratePlanId: e.target.value })}
            />
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })} />
              <span>مفعّل</span>
            </div>
            <div className="flex gap-2 mt-6">
              <Button loading={savingEdit} onClick={saveEdit} className="flex-1">💾 حفظ</Button>
              <Button variant="secondary" onClick={() => setEditMapping(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}