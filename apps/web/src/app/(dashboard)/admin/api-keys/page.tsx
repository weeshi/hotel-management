'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Select } from '@/components/ui';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/utils/api-client';
import { addToast } from '@/lib/utils/toast';

const PARTNER_TYPES = [
  { value: 'HOTEL_SITE', label: '🖥️ موقع الفندق' },
  { value: 'B2C_AGGREGATOR', label: '🏢 منصة حجز مركزي (B2C)' },
  { value: 'B2B_AGENCY', label: '🤝 وكالة سفر (B2B)' },
  { value: 'CHANNEL_MANAGER', label: '📡 مدير قنوات OTA' },
];

const SCOPES = [
  { value: 'bookings:write', label: 'إنشاء الحجوزات' },
  { value: 'bookings:read', label: 'قراءة الحجوزات' },
  { value: 'availability:read', label: 'استعلام التوفر' },
  { value: 'pricing:read', label: 'استعلام الأسعار' },
  { value: 'webhook:manage', label: 'إدارة الـ Webhooks' },
];

interface ApiKeyRow {
  id: string;
  label: string;
  hotelId: string | null;
  partnerType: string;
  prefix: string;
  scopes: string[];
  rateLimit: number;
  dailyLimit: number;
  allowedIPs: string | null;
  isActive: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  lastRotatedAt: string | null;
}

interface HotelOption {
  id: string;
  name: string;
}

const emptyForm = {
  label: '',
  partnerType: 'HOTEL_SITE',
  hotelId: '',
  scopes: new Set(['bookings:write']),
  rateLimit: '100',
  dailyLimit: '10000',
  allowedIPs: '',
  expiresAt: '',
};

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [hotels, setHotels] = useState<HotelOption[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [revealed, setRevealed] = useState<{ label: string; apiKey: string } | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);

  const [editKey, setEditKey] = useState<ApiKeyRow | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  async function fetchKeys() {
    setLoading(true);
    const res = await apiGet<ApiKeyRow[]>('/api/admin/api-keys');
    if (res.success) {
      setKeys(res.data);
    } else {
      addToast('error', res.error?.message || 'فشل تحميل المفاتيح');
    }
    setLoading(false);
  }

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        setUserRole(JSON.parse(stored).role || '');
      } catch {}
    }
    fetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') {
      apiGet<HotelOption[]>('/api/superadmin/hotels').then((res) => {
        if (res.success && Array.isArray(res.data)) setHotels(res.data);
      });
    }
  }, [userRole]);

  const hotelLabel = (id: string | null) => {
    if (!id) return '🌐 منصة (جميع الفنادق)';
    const found = hotels.find((h) => h.id === id);
    return found ? found.name : id;
  };

  async function createKey() {
    if (!form.label.trim()) {
      addToast('error', 'اسم المفتاح مطلوب');
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      label: form.label.trim(),
      partnerType: form.partnerType,
      scopes: Array.from(form.scopes),
      rateLimit: parseInt(form.rateLimit, 10) || 100,
      dailyLimit: parseInt(form.dailyLimit, 10) || 10000,
      allowedIPs: form.allowedIPs.trim() || undefined,
    };
    // Platform-wide when SUPER_ADMIN and no hotel selected.
    if (userRole !== 'SUPER_ADMIN' || form.hotelId) {
      body.hotelId = form.hotelId || undefined;
    }
    if (form.expiresAt) {
      body.expiresAt = new Date(form.expiresAt).toISOString();
    }

    const res = await apiPost<{ key: ApiKeyRow; apiKey: string }>('/api/admin/api-keys', body);
    if (res.success) {
      addToast('success', '🔑 تم إنشاء المفتاح — انسخه الآن، لن يظهر مرة أخرى');
      setRevealed({ label: res.data.key.label, apiKey: res.data.apiKey });
      setCreateOpen(false);
      setForm(emptyForm);
      fetchKeys();
    } else {
      addToast('error', res.error?.message || 'فشل إنشاء المفتاح');
    }
    setSaving(false);
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => addToast('success', '📋 تم النسخ'),
      () => addToast('error', 'تعذر النسخ')
    );
  }

  async function rotateKey(row: ApiKeyRow) {
    setRotating(row.id);
    const res = await apiPost<{ key: ApiKeyRow; apiKey: string }>(
      `/api/admin/api-keys/${row.id}`,
      { action: 'rotate' }
    );
    if (res.success) {
      addToast('success', '🔄 تم تدوير المفتاح');
      setRevealed({ label: row.label, apiKey: res.data.apiKey });
      fetchKeys();
    } else {
      addToast('error', res.error?.message || 'فشل تدوير المفتاح');
    }
    setRotating(null);
  }

  async function toggleKey(row: ApiKeyRow) {
    const res = await apiPatch(`/api/admin/api-keys/${row.id}`, {
      isActive: !row.isActive,
    });
    if (res.success) {
      addToast('success', row.isActive ? '⛔ تم إيقاف المفتاح' : '✅ تم تفعيل المفتاح');
      fetchKeys();
    } else {
      addToast('error', res.error?.message || 'فشل تحديث المفتاح');
    }
  }

  async function revokeKey(row: ApiKeyRow) {
    if (!window.confirm(`إبطال المفتاح «${row.label}»؟ سيتم رفض جميع الطلبات فوراً.`)) return;
    const res = row.revokedAt
      ? await apiPatch(`/api/admin/api-keys/${row.id}`, { revokedAt: null })
      : await apiDelete(`/api/admin/api-keys/${row.id}`);
    if (res.success) {
      addToast('success', row.revokedAt ? '♻️ تم إعادة تفعيل المفتاح' : '🗑️ تم إبطال المفتاح');
      fetchKeys();
    } else {
      addToast('error', res.error?.message || 'فشل تحديث المفتاح');
    }
  }

  function openEdit(row: ApiKeyRow) {
    setEditKey(row);
    setEditForm({
      label: row.label,
      partnerType: row.partnerType,
      scopes: new Set(row.scopes),
      rateLimit: String(row.rateLimit),
      dailyLimit: String(row.dailyLimit),
      allowedIPs: row.allowedIPs || '',
      expiresAt: row.expiresAt ? row.expiresAt.slice(0, 16) : '',
    });
  }

  async function saveEdit() {
    if (!editKey) return;
    setSavingEdit(true);
    const body: Record<string, unknown> = {
      label: editForm.label,
      partnerType: editForm.partnerType,
      scopes: Array.from(editForm.scopes || []),
      rateLimit: parseInt(editForm.rateLimit, 10),
      dailyLimit: parseInt(editForm.dailyLimit, 10),
      allowedIPs: editForm.allowedIPs?.trim() || null,
    };
    body.expiresAt = editForm.expiresAt
      ? new Date(editForm.expiresAt).toISOString()
      : null;

    const res = await apiPatch(`/api/admin/api-keys/${editKey.id}`, body);
    if (res.success) {
      addToast('success', '💾 تم حفظ التغييرات');
      setEditKey(null);
      fetchKeys();
    } else {
      addToast('error', res.error?.message || 'فشل حفظ التغييرات');
    }
    setSavingEdit(false);
  }

  const endpointBase = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div data-component="AdminApiKeysPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔑 مفاتيح API الخارجية</h1>
        <Button onClick={() => setCreateOpen(true)}>➕ مفتاح جديد</Button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-6 text-sm space-y-2" data-component="HeadlessUsage">
        <div className="font-bold text-[var(--gold)]">🚀 واجهة الحجز اللامركزية (Headless Booking API)</div>
        <div className="text-xs text-[var(--text-muted)] leading-relaxed">
          مواقع الفندق والوكلاء والمنصات تنشئ الحجوزات عبر موافقة واحدة. المفاتيح تُخزَّن بشكل مشفّر
          (SHA-256) ولا تظهر إلا مرة واحدة عند الإنشاء.
        </div>
        <code className="block text-[11px] bg-black/40 rounded-lg px-3 py-2 leading-relaxed" dir="ltr">
          POST {endpointBase}/api/external/bookings
          <br />
          Header: x-api-key: &lt;your-key&gt;
          <br />
          Idempotency: externalRef (معرّف تكرار)
        </code>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--text-muted)]">جاري التحميل...</div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center text-[var(--text-muted)]">
          لا توجد مفاتيح بعد — اضغط «مفتاح جديد» لربط موقع فندقك أو وكيلك
        </div>
      ) : (
        <div className="grid gap-4">
          {keys.map((row) => (
            <div
              key={row.id}
              data-component={`ApiKeyCard-${row.label}`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🗝️</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{row.label}</span>
                      <code className="text-[10px] bg-black/40 rounded px-1.5 py-0.5" dir="ltr">
                        {row.prefix}…
                      </code>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      {PARTNER_TYPES.find((p) => p.value === row.partnerType)?.label || row.partnerType}
                      {' · '}
                      {hotelLabel(row.hotelId)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.isActive ? 'green' : 'red'}>
                    {row.isActive ? 'نشط' : 'موقوف'}
                  </Badge>
                  {row.revokedAt && <Badge variant="red">مُبطَل</Badge>}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] font-semibold mb-1">الصلاحيات</div>
                  <div className="flex flex-wrap gap-1">
                    {row.scopes.map((s) => (
                      <span key={s} className="bg-black/30 rounded px-1.5 py-0.5" dir="ltr">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] font-semibold mb-1">الحدود</div>
                  <div dir="ltr">{row.rateLimit}/دقيقة · {row.dailyLimit}/يوم</div>
                  {row.expiresAt && (
                    <div className="text-[var(--red)] mt-0.5">
                      تنتهي {new Date(row.expiresAt).toLocaleString('ar-LY')}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] font-semibold mb-1">آخر استخدام</div>
                  <div>{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString('ar-LY') : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] font-semibold mb-1">IP مسموح</div>
                  <div dir="ltr">{row.allowedIPs || 'الكل'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="secondary" size="sm" onClick={() => openEdit(row)}>
                  ✏️ تعديل
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={rotating === row.id}
                  onClick={() => rotateKey(row)}
                >
                  🔄 تدوير
                </Button>
                <Button variant="secondary" size="sm" onClick={() => toggleKey(row)}>
                  {row.isActive ? '⛔ إيقاف' : '✅ تفعيل'}
                </Button>
                <Button
                  variant={row.revokedAt ? 'secondary' : 'danger'}
                  size="sm"
                  onClick={() => revokeKey(row)}
                >
                  {row.revokedAt ? '♻️ إعادة تفعيل' : '🗑️ إبطال'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">🔑 مفتاح API جديد</h2>

            <div className="space-y-4">
              <Input
                id="key-label"
                label="اسم المفتاح"
                placeholder="مثال: موقع الفندق الرسمي"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />

              <Select
                id="key-partner"
                label="نوع الشريك"
                options={PARTNER_TYPES}
                value={form.partnerType}
                onChange={(e) => setForm({ ...form, partnerType: e.target.value })}
              />

              {userRole === 'SUPER_ADMIN' && (
                <Select
                  id="key-hotel"
                  label="الفندق (اتركه فارغاً لمفتاح منصة لكل الفنادق)"
                  options={[
                    { value: '', label: '🌐 منصة — جميع الفنادق' },
                    ...hotels.map((h) => ({ value: h.id, label: h.name })),
                  ]}
                  value={form.hotelId}
                  onChange={(e) => setForm({ ...form, hotelId: e.target.value })}
                />
              )}

              <div>
                <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">الصلاحيات</div>
                <div className="space-y-1.5">
                  {SCOPES.map((s) => (
                    <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.scopes.has(s.value)}
                        onChange={() => {
                          const next = new Set(form.scopes);
                          if (next.has(s.value)) next.delete(s.value);
                          else next.add(s.value);
                          setForm({ ...form, scopes: next });
                        }}
                      />
                      <span dir="ltr">{s.value}</span>
                      <span className="text-[var(--text-muted)]">— {s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="key-rate"
                  label="حد الطلبات/دقيقة"
                  type="number"
                  min={1}
                  value={form.rateLimit}
                  onChange={(e) => setForm({ ...form, rateLimit: e.target.value })}
                />
                <Input
                  id="key-daily"
                  label="حد الطلبات/يوم"
                  type="number"
                  min={1}
                  value={form.dailyLimit}
                  onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })}
                />
              </div>

              <Input
                id="key-ips"
                label="العناوين IP المسموحة (افصل بفواصل، اتركه فارغاً للجميع)"
                placeholder="203.0.113.10, 198.51.100.0/24"
                dir="ltr"
                value={form.allowedIPs}
                onChange={(e) => setForm({ ...form, allowedIPs: e.target.value })}
              />

              <Input
                id="key-expires"
                label="تاريخ الانتهاء (اختياري)"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>

            <div className="flex gap-2 mt-6">
              <Button loading={saving} onClick={createKey} className="flex-1">
                🔑 إنشاء المفتاح
              </Button>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70" onClick={() => setEditKey(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">✏️ تعديل «{editKey.label}»</h2>

            <div className="space-y-4">
              <Input
                id="edit-label"
                label="اسم المفتاح"
                value={editForm.label || ''}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
              />
              <Select
                id="edit-partner"
                label="نوع الشريك"
                options={PARTNER_TYPES}
                value={editForm.partnerType || 'HOTEL_SITE'}
                onChange={(e) => setEditForm({ ...editForm, partnerType: e.target.value })}
              />
              <div>
                <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">الصلاحيات</div>
                <div className="space-y-1.5">
                  {SCOPES.map((s) => (
                    <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(editForm.scopes || new Set()).has(s.value)}
                        onChange={() => {
                          const next = new Set(editForm.scopes || []);
                          if (next.has(s.value)) next.delete(s.value);
                          else next.add(s.value);
                          setEditForm({ ...editForm, scopes: next });
                        }}
                      />
                      <span dir="ltr">{s.value}</span>
                      <span className="text-[var(--text-muted)]">— {s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="edit-rate"
                  label="حد الطلبات/دقيقة"
                  type="number"
                  min={1}
                  value={editForm.rateLimit || '100'}
                  onChange={(e) => setEditForm({ ...editForm, rateLimit: e.target.value })}
                />
                <Input
                  id="edit-daily"
                  label="حد الطلبات/يوم"
                  type="number"
                  min={1}
                  value={editForm.dailyLimit || '10000'}
                  onChange={(e) => setEditForm({ ...editForm, dailyLimit: e.target.value })}
                />
              </div>
              <Input
                id="edit-ips"
                label="العناوين IP المسموحة"
                dir="ltr"
                value={editForm.allowedIPs || ''}
                onChange={(e) => setEditForm({ ...editForm, allowedIPs: e.target.value })}
              />
              <Input
                id="edit-expires"
                label="تاريخ الانتهاء (اختياري)"
                type="datetime-local"
                value={editForm.expiresAt || ''}
                onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })}
              />
            </div>

            <div className="flex gap-2 mt-6">
              <Button loading={savingEdit} onClick={saveEdit} className="flex-1">
                💾 حفظ
              </Button>
              <Button variant="secondary" onClick={() => setEditKey(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* One-time key reveal */}
      {revealed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70" />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6" data-component="RevealedKey">
            <h2 className="text-lg font-bold mb-2 text-green-400">🔑 المفتاح الجديد — «{revealed.label}»</h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              ⚠️ هذا المفتاح يظهر مرة واحدة فقط. انسخه الآن وأرسله للشريك بأمان.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-xs bg-black/40 rounded-lg px-3 py-2" dir="ltr">
                {revealed.apiKey}
              </code>
              <Button variant="secondary" size="sm" onClick={() => copy(revealed.apiKey)}>
                📋 نسخ
              </Button>
            </div>
            <div className="mt-4">
              <Button className="w-full" onClick={() => setRevealed(null)}>
                تم — إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}