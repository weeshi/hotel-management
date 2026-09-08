'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Select } from '@/components/ui';
import { apiGet, apiPatch, apiPost } from '@/lib/utils/api-client';
import { addToast } from '@/lib/utils/toast';

const ENGINES = [
  { value: 'booking.com', label: '🌐 Booking.com', name: 'Booking.com' },
  { value: 'expedia', label: '✈️ Expedia', name: 'Expedia' },
  { value: 'website', label: '🖥️ موقع الفندق', name: 'Website' },
  { value: 'custom', label: '🔌 تكامل مخصص', name: 'Custom' },
];

interface Config {
  id: string;
  engine: string;
  isActive: boolean;
  hasKey: boolean;
}

export default function AdminIntegrationsPage() {
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [generatedKeys, setGeneratedKeys] = useState<Record<string, string>>({});

  async function fetchConfigs() {
    setLoading(true);
    const res = await apiGet<any[]>('/api/admin/integrations');
    if (res.success) {
      const map: Record<string, Config> = {};
      const a: Record<string, boolean> = {};
      for (const c of res.data) {
        map[c.engine] = c;
        a[c.engine] = c.isActive;
      }
      setConfigs(map);
      setActive(a);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchConfigs();
  }, []);

  async function saveConfig(e: string) {
    setSaving(e);
    const body: Record<string, unknown> = { engine: e, isActive: active[e] || false };
    const res = configs[e]
      ? await apiPatch(`/api/admin/integrations/${e}`, body)
      : await apiPost('/api/admin/integrations', body);

    if (res.success) {
      addToast('success', '✅ تم حفظ إعدادات التكامل');
      fetchConfigs();
    } else {
      addToast('error', res.error?.message || 'فشل حفظ الإعدادات');
    }
    setSaving(null);
  }

  async function generateKey(e: string) {
    setGenerating(e);
    const res = await apiPost<{ apiKey: string }>(`/api/admin/integrations/${e}/key`);
    if (res.success) {
      setGeneratedKeys((prev) => ({ ...prev, [e]: res.data.apiKey }));
      addToast('success', '🔑 تم توليد المفتاح — انسخه الآن، لن يظهر مرة أخرى');
      fetchConfigs();
    } else {
      addToast('error', res.error?.message || 'فشل توليد المفتاح');
    }
    setGenerating(null);
  }

  function copyKey(e: string) {
    const key = generatedKeys[e];
    if (!key) return;
    navigator.clipboard?.writeText(key).then(
      () => addToast('success', '📋 تم نسخ المفتاح'),
      () => addToast('error', 'تعذر النسخ')
    );
  }

  const endpointBase = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div data-component="AdminIntegrationsPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔌 تكاملات محركات الحجز</h1>
        <span className="text-xs text-[var(--text-muted)]">
          محركات الحجز الخارجية تحقن الحجوزات المؤكدة — المفاتيح مشفّرة وتظهر مرة واحدة فقط
        </span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--text-muted)]">جاري التحميل...</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {ENGINES.map((engine) => {
            const cfg = configs[engine.value];
            const newKey = generatedKeys[engine.value];
            return (
              <div
                key={engine.value}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4"
                data-component={`IntegrationCard-${engine.value}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{engine.label.split(' ')[0]}</span>
                    <span className="font-bold">{engine.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={active[engine.value] ? 'green' : 'red'}>
                      {active[engine.value] ? 'نشط' : 'موقوف'}
                    </Badge>
                    <Badge variant={cfg?.hasKey ? 'green' : 'red'}>
                      {cfg?.hasKey ? 'مفتاح مضبوط' : 'بدون مفتاح'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold mb-2">الحالة</span>
                  <Select
                    options={[
                      { value: 'true', label: '✅ مفعّل' },
                      { value: 'false', label: '⛔ موقوف' },
                    ]}
                    value={active[engine.value] !== undefined ? String(active[engine.value]) : 'false'}
                    onChange={(e) => setActive((prev) => ({ ...prev, [engine.value]: e.target.value === 'true' }))}
                  />
                </div>

                {newKey && (
                  <div className="rounded-lg border border-[var(--border)] p-3 space-y-2" data-component={`GeneratedKey-${engine.value}`}>
                    <p className="text-xs text-green-400">🔑 المفتاح الجديد (يظهر مرة واحدة فقط):</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all text-xs bg-black/40 rounded px-2 py-1" dir="ltr">
                        {newKey}
                      </code>
                      <Button variant="secondary" size="sm" onClick={() => copyKey(engine.value)}>
                        📋 نسخ
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={generating === engine.value}
                    onClick={() => generateKey(engine.value)}
                  >
                    {cfg?.hasKey ? '🔄 تدوير المفتاح' : '🔑 توليد مفتاح'}
                  </Button>
                  <Button size="sm" loading={saving === engine.value} onClick={() => saveConfig(engine.value)}>
                    💾 حفظ
                  </Button>
                </div>

                <div className="text-[10px] text-[var(--text-muted)] leading-relaxed" dir="ltr">
                  Endpoint: POST {endpointBase}/api/integrations/{engine.value}/bookings
                  <br />
                  Header: x-api-key: &lt;your key&gt;
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
