'use client';

import { useEffect, useState } from 'react';
import { Button, Badge, Card, Input, Select, Modal, EmptyState, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';
import { addToast } from '@/lib/utils/toast';
import { useSudoMutation } from '@/lib/sudo/useSudoMutation';
import {
  PROVIDER_REGISTRY,
  PAYMENT_GATEWAY_ENGINES,
  type ProviderDefinition,
} from '@/lib/integrations/registry';

/**
 * SA.7 — Super-Admin payment-gateway key management (docs/SUPER-ADMIN-ARCH.md
 * §7 + §SA.7). Every write/delete runs through `useSudoMutation`: the backend
 * demands a fresh step-up (`403 STEP_UP_REQUIRED`), the shared SudoProvider
 * shows the OTP modal exactly once, then replays the mutation with
 * `x-sudo-token`. Secrets NEVER echo back — GET exposes only `hasKey`, so an
 * already-configured gateway shows a «مُعدّ مسبقاً» badge instead of empty
 * fields, and the form only submits a credential when the Admin actually typed
 * a NEW one.
 */

interface HotelRow {
  id: string;
  name: string;
}

interface IntegrationConfigRow {
  id: string;
  engine: string;
  kind: string;
  isActive: boolean;
  hasKey: boolean;
  config: Record<string, string | boolean> | null;
  updatedAt: string;
}

interface EngineFormState {
  secrets: Record<string, string>;
  config: Record<string, string | boolean>;
  isActive: boolean;
  revealSecrets: boolean;
}

const GATEWAY_ENGINES = [...PAYMENT_GATEWAY_ENGINES];

const GATEWAY_META: Record<string, { title: string; icon: string }> = {
  plutu: { title: 'Plutu', icon: '🏦' },
  tlync: { title: 'T-Lync', icon: '📱' },
};

// Sentinel placed into secret inputs when an existing credential is being
// edited — distinguishes "keep the stored value" from "type a new key".
const KEEP_SECRET_MASK = '••••••••';

function defaultForm(def: ProviderDefinition): EngineFormState {
  const secrets: Record<string, string> = {};
  for (const field of def.secretFields) secrets[field] = '';
  const config: Record<string, string | boolean> = {};
  for (const field of def.configFields) {
    config[field] = field === 'isSandbox' ? true : '';
  }
  return { secrets, config, isActive: false, revealSecrets: false };
}

function formFromConfig(def: ProviderDefinition, row: IntegrationConfigRow | undefined): EngineFormState {
  const form = defaultForm(def);
  if (!row) return form;
  form.isActive = row.isActive;
  if (row.config) {
    for (const [key, value] of Object.entries(row.config)) {
      if (key in form.config) form.config[key] = value;
    }
  }
  return form;
}

const SECRET_LABELS: Record<string, string> = {
  merchantId: 'معرّف التاجر (Merchant ID)',
  secretKey: 'المفتاح السري (Secret Key)',
  apiKey: 'مفتاح API',
};

const CONFIG_LABELS: Record<string, string> = {
  baseUrl: 'رابط الأساس (Base URL)',
  returnUrl: 'رابط العودة (Return URL)',
  callbackUrl: 'رابط ردّ الاتصال (Callback URL)',
};

export default function SuperAdminIntegrationsPage() {
  const { sudoMutation } = useSudoMutation();

  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [selectedHotelId, setSelectedHotelId] = useState('');

  const [configs, setConfigs] = useState<IntegrationConfigRow[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  const [forms, setForms] = useState<Record<string, EngineFormState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchHotels() {
    setLoadingHotels(true);
    const res = await apiGet<HotelRow[]>('/api/superadmin/hotels');
    if (res.success) {
      setHotels(res.data);
      if (res.data.length > 0) {
        const current = res.data.find((h) => h.id === selectedHotelId);
        if (!current) setSelectedHotelId(res.data[0].id);
      }
    } else {
      addToast('error', res.error?.message || 'فشل تحميل الفنادق');
    }
    setLoadingHotels(false);
  }

  useEffect(() => {
    fetchHotels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchConfigs(hotelId: string) {
    setLoadingConfigs(true);
    const res = await apiGet<IntegrationConfigRow[]>(
      `/api/superadmin/integrations?hotelId=${hotelId}`
    );
    if (res.success) {
      setConfigs(res.data);
      setForms((prev) => {
        const next: Record<string, EngineFormState> = { ...prev };
        for (const engine of GATEWAY_ENGINES) {
          const def = PROVIDER_REGISTRY[engine];
          const row = res.data.find((c) => c.engine === engine);
          next[engine] = formFromConfig(def, row);
        }
        return next;
      });
    } else {
      addToast('error', res.error?.message || 'فشل تحميل التكاملات');
    }
    setLoadingConfigs(false);
  }

  useEffect(() => {
    if (selectedHotelId) fetchConfigs(selectedHotelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotelId]);

  function setFormField(engine: string, key: keyof EngineFormState, value: unknown) {
    setForms((prev) => ({ ...prev, [engine]: { ...prev[engine], [key]: value } }));
  }

  function setSecretField(engine: string, field: string, value: string) {
    setForms((prev) => {
      const form = prev[engine];
      return { ...prev, [engine]: { ...form, secrets: { ...form.secrets, [field]: value } } };
    });
  }

  function setConfigField(engine: string, field: string, value: string | boolean) {
    setForms((prev) => {
      const form = prev[engine];
      return { ...prev, [engine]: { ...form, config: { ...form.config, [field]: value } } };
    });
  }

  /** Reveal the secret inputs prefilled with the keep-mask, never empty. */
  function revealSecrets(engine: string) {
    setForms((prev) => {
      const form = prev[engine];
      const secrets: Record<string, string> = {};
      for (const field of Object.keys(form.secrets)) secrets[field] = KEEP_SECRET_MASK;
      return { ...prev, [engine]: { ...form, secrets, revealSecrets: true } };
    });
  }

  async function saveEngine(engine: string) {
    const def = PROVIDER_REGISTRY[engine];
    if (!def || !selectedHotelId) return;
    const form = forms[engine];
    if (!form) return;
    setSaving((s) => ({ ...s, [engine]: true }));

    const body: Record<string, unknown> = {
      hotelId: selectedHotelId,
      engine,
      isActive: form.isActive,
    };

    // The secret bundle is sent ONLY when the Super Admin typed a NEW value.
    // The keep-mask (or an empty box) means "leave the stored credential
    // alone"; on a first configure the typed values ARE the new key, so the
    // scan runs unconditionally rather than gated on the «تعديل» reveal flag.
    const secret: Record<string, string> = {};
    let changed = false;
    for (const field of def.secretFields) {
      const value = form.secrets[field]?.trim() ?? '';
      if (value !== '' && value !== KEEP_SECRET_MASK) {
        secret[field] = value;
        changed = true;
      }
    }
    if (changed) body.secret = secret;

    const config: Record<string, unknown> = {};
    for (const field of def.configFields) {
      const value = form.config[field];
      if (value !== undefined && value !== null && value !== '') config[field] = value;
    }
    if (Object.keys(config).length > 0) body.config = config;

    const res = await sudoMutation({
      method: 'POST',
      url: '/api/superadmin/integrations',
      body,
    });

    setSaving((s) => ({ ...s, [engine]: false }));

    if (!res.success) {
      addToast('error', res.error?.message || 'فشل حفظ التكامل');
      return;
    }
    addToast('success', `✅ تم حفظ تكامل ${GATEWAY_META[engine]?.title ?? engine}`);
    await fetchConfigs(selectedHotelId);
  }

  async function confirmDelete() {
    if (!deleteTarget || !selectedHotelId) return;
    setDeleting(true);
    const res = await sudoMutation({
      method: 'DELETE',
      url: `/api/superadmin/integrations?hotelId=${selectedHotelId}&engine=${deleteTarget}`,
    });
    setDeleting(false);
    if (!res.success) {
      addToast('error', res.error?.message || 'فشل حذف التكامل');
      return;
    }
    addToast('success', '🗑️ تم حذف التكامل');
    setDeleteTarget(null);
    await fetchConfigs(selectedHotelId);
  }

  function renderEngineCard(engine: string) {
    const def = PROVIDER_REGISTRY[engine];
    const meta = GATEWAY_META[engine];
    const form = forms[engine];
    const row = configs.find((c) => c.engine === engine);
    if (!def || !form) return null;
    const isSaving = saving[engine];

    return (
      <Card
        key={engine}
        title={`${meta?.icon ?? '🔌'} ${meta?.title ?? engine}`}
        action={
          row ? (
            <Badge variant={row.isActive ? 'green' : 'yellow'} data-testid={`status-badge-${engine}`}>
              {row.isActive ? 'مفعّل' : 'متوقف'}
            </Badge>
          ) : undefined
        }
      >
        <div data-testid={`engine-card-${engine}`} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {row?.hasKey ? (
              <>
                <Badge variant="green" data-testid={`haskey-badge-${engine}`}>مُعدّ مسبقاً</Badge>
                {!form.revealSecrets && (
                  <button
                    data-testid={`btn-reveal-${engine}`}
                    onClick={() => revealSecrets(engine)}
                    className="text-xs text-[var(--blue)] hover:underline"
                  >
                    تعديل
                  </button>
                )}
              </>
            ) : (
              <Badge variant="yellow" data-testid={`nokey-badge-${engine}`}>غير مكوّن</Badge>
            )}
            {row && (
              <span className="text-[10px] text-[var(--text-muted)]">
                آخر تحديث: {new Date(row.updatedAt).toLocaleDateString('ar-LY')}
              </span>
            )}
          </div>

          {row?.hasKey && !form.revealSecrets ? (
            <p className="text-xs text-[var(--text-muted)] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] px-3 py-2.5">
              البيانات السرّية محفوظة ولا تُعرض لأسباب أمنية (zero-leakage).
            </p>
          ) : (
            <div className="space-y-3">
              {def.secretFields.map((field) => (
                <Input
                  key={field}
                  label={SECRET_LABELS[field] ?? field}
                  type="password"
                  dir="ltr"
                  data-testid={`secret-${engine}-${field}`}
                  value={form.secrets[field] ?? ''}
                  onChange={(e) => setSecretField(engine, field, e.target.value)}
                  placeholder={row?.hasKey ? KEEP_SECRET_MASK : '••••••••'}
                />
              ))}
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-3 space-y-3">
            {def.configFields
              .filter((f) => f !== 'isSandbox')
              .map((field) => (
                <Input
                  key={field}
                  label={CONFIG_LABELS[field] ?? field}
                  dir="ltr"
                  data-testid={`config-${engine}-${field}`}
                  value={String(form.config[field] ?? '')}
                  onChange={(e) => setConfigField(engine, field, e.target.value)}
                />
              ))}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                وضع الاختبار (Sandbox)
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(form.config.isSandbox)}
                data-testid={`switch-sandbox-${engine}`}
                onClick={() => setConfigField(engine, 'isSandbox', !form.config.isSandbox)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.config.isSandbox
                    ? 'bg-[var(--gold)]'
                    : 'bg-[var(--bg-card-hover)] border border-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.config.isSandbox ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm font-medium text-[var(--text-secondary)]">تفعيل البوابة</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                data-testid={`switch-isactive-${engine}`}
                onClick={() => setFormField(engine, 'isActive', !form.isActive)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.isActive
                    ? 'bg-[var(--green)]'
                    : 'bg-[var(--bg-card-hover)] border border-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            <div className="flex items-center gap-2">
              {row && (
                <Button
                  variant="danger"
                  size="sm"
                  data-testid={`btn-delete-${engine}`}
                  onClick={() => setDeleteTarget(engine)}
                >
                  حذف
                </Button>
              )}
              <Button size="sm" data-testid={`btn-save-${engine}`} loading={isSaving} onClick={() => saveEngine(engine)}>
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div data-component="SuperAdminIntegrationsPage" data-testid="integrations-page">
      <div className="mb-6">
        <h2 className="text-lg font-bold">🔌 تكاملات بوابات الدفع</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          إدارة مفاتيح بوابات الدفع لكل فندق. الحفظ والحذف يتطلبان تأكيداً إضافياً
          (Sudo Mode) عبر رمز يصل إلى بريدك.
        </p>
      </div>

      <div className="mb-6 max-w-md">
        <Select
          label="الفندق"
          data-testid="hotel-selector"
          value={selectedHotelId}
          onChange={(e) => setSelectedHotelId(e.target.value)}
          placeholder={loadingHotels ? 'جارٍ تحميل الفنادق…' : 'اختر فندقاً'}
          options={hotels.map((h) => ({ value: h.id, label: h.name }))}
        />
      </div>

      {!selectedHotelId ? (
        <Card>
          <EmptyState
            icon="🏨"
            title={loadingHotels ? 'جارٍ تحميل الفنادق…' : 'اختر فندقاً أولاً'}
            description="اختر فندقاً من القائمة لإدارة تكاملات بوابات الدفع الخاصة به"
          />
        </Card>
      ) : loadingConfigs ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {GATEWAY_ENGINES.map(renderEngineCard)}
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="🗑️ حذف التكامل"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          سيتم حذف مفاتيح بوابة{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            {deleteTarget ? GATEWAY_META[deleteTarget]?.title : ''}
          </span>{' '}
          نهائياً لهذا الفندق. لا يمكن التراجع عن هذا الإجراء.
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>
            إلغاء
          </Button>
          <Button variant="danger" type="button" loading={deleting} onClick={confirmDelete}>
            حذف نهائي
          </Button>
        </div>
      </Modal>
    </div>
  );
}