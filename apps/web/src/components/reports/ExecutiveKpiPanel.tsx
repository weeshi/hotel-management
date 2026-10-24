'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';

interface ExecutiveKpiPeriod {
  startBound: string;
  endBound: string;
  totalDays: number;
  effectiveEndDate: string;
  isPartialPeriod: boolean;
  timezone: string;
}

interface ExecutiveKpiInventory {
  totalPhysicalRooms: number;
  maintenanceRooms: number;
  sellableRooms: number;
  availableRoomNights: number;
  occupiedRoomNights: number;
}

interface ExecutiveKpis {
  occupancyRate: number;
  isOverbooked: boolean;
  accruedRoomRevenue: number;
  adr: number;
  revPar: number;
  netRevenue: number;
  taxTotal: number;
  grossBilled: number;
  totalCollected: number;
  collectionRate: number;
}

interface ExecutiveKpiAlerts {
  pendingWebBookings: number;
  unassignedBookingRooms: number;
}

interface ExecutiveKpiReport {
  period: ExecutiveKpiPeriod;
  inventory: ExecutiveKpiInventory;
  kpis: ExecutiveKpis;
  revenueByCategory: Record<string, number>;
  operationalAlerts: ExecutiveKpiAlerts;
}

interface ExecutiveKpiPanelProps {
  startDate?: string;
  endDate?: string;
}

const CATEGORY_ORDER = [
  'ROOM_CHARGE',
  'RESTAURANT',
  'SERVICE',
  'SAFE_DEPOSIT',
  'TAX',
  'DISCOUNT',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  ROOM_CHARGE: 'إيراد الغرف',
  RESTAURANT: 'المطعم',
  SERVICE: 'الخدمات',
  SAFE_DEPOSIT: 'الخزائن',
  TAX: 'الضريبة',
  DISCOUNT: 'الخصومات',
};

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function KpiCard({
  label,
  value,
  hint,
  accent,
  warning,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  warning?: boolean;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        {warning ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--red)] text-white">
            تجاوز الإشغال
          </span>
        ) : null}
      </div>
      <p className="text-2xl font-bold mt-2" style={{ color: accent }}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-[var(--text-muted)] mt-1">{hint}</p> : null}
    </Card>
  );
}

export function ExecutiveKpiPanel({ startDate, endDate }: ExecutiveKpiPanelProps) {
  const [report, setReport] = useState<ExecutiveKpiReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const query = params.toString();
    const response = await apiGet<ExecutiveKpiReport>(
      `/api/admin/reports/executive-kpis${query ? `?${query}` : ''}`,
    );

    if (response.success) {
      setReport(response.data);
    } else {
      setErrorMessage(response.error.message);
    }
    setIsLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  if (isLoading) {
    return (
      <Card className="!p-4">
        <p className="text-sm text-[var(--text-muted)]">جارٍ تحميل مؤشرات الأداء التنفيذية…</p>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="!p-4">
        <p className="text-sm text-[var(--red)]">{errorMessage}</p>
      </Card>
    );
  }

  if (!report) return null;

  const { kpis, inventory, revenueByCategory, operationalAlerts, period } = report;

  return (
    <Card className="!p-5" data-component="ExecutiveKpiPanel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold">📈 مؤشرات الأداء التنفيذية (USALI-style)</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {period.startBound.slice(0, 10)} → {period.effectiveEndDate} ·{' '}
            {period.totalDays} يوماً · {period.timezone}
            {period.isPartialPeriod ? (
              <span className="ms-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--yellow)] text-black">
                فترة جزئية (حتى اليوم)
              </span>
            ) : null}
          </p>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          ليالٍ متاحة {inventory.availableRoomNights} · مشغولة {inventory.occupiedRoomNights}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="نسبة الإشغال"
          value={`${kpis.occupancyRate}%`}
          hint={`${inventory.occupiedRoomNights} / ${inventory.availableRoomNights}`}
          accent="var(--gold)"
          warning={kpis.isOverbooked}
        />
        <KpiCard
          label="ADR"
          value={formatMoney(kpis.adr)}
          hint="متوسط السعر اليومي (استحقاق)"
          accent="var(--blue)"
        />
        <KpiCard
          label="RevPAR"
          value={formatMoney(kpis.revPar)}
          hint="العائد لكل غرفة متاحة (استحقاق)"
          accent="var(--blue)"
        />
        <KpiCard
          label="Net Revenue"
          value={formatMoney(kpis.netRevenue)}
          hint="صافي الإيراد (بدون ضريبة)"
          accent="var(--green)"
        />
        <KpiCard
          label="Gross Billed"
          value={formatMoney(kpis.grossBilled)}
          hint="الإجمالي المفوتر (شامل الضريبة)"
          accent="var(--gold)"
        />
        <KpiCard
          label="نسبة تحصيل الفترة (شاملة العربونات)"
          value={`${kpis.collectionRate}%`}
          hint={`محصّل ${formatMoney(kpis.totalCollected)} — مدفوعات الفترة مقابل مفوتر الفترة`}
          accent="var(--green)"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">
            إيرادات الدفتر المفوترة خلال الفترة (Billed Ledger)
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs">
                <th className="text-right p-2">الفئة</th>
                <th className="text-left p-2">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map((category) => (
                <tr key={category} className="border-b border-[var(--border)]">
                  <td className="p-2">{CATEGORY_LABELS[category] ?? category}</td>
                  <td
                    className="p-2 text-left font-semibold"
                    style={{ color: category === 'DISCOUNT' ? 'var(--red)' : 'var(--text)' }}
                  >
                    {formatMoney(revenueByCategory[category] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">
            التنبيهات التشغيلية
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
              <span className="text-sm">حجوزات ويب معلّقة</span>
              <span
                className="text-sm font-bold"
                style={{ color: operationalAlerts.pendingWebBookings > 0 ? 'var(--yellow)' : 'var(--green)' }}
              >
                {operationalAlerts.pendingWebBookings}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
              <span className="text-sm">غرف بانتظار التخصيص</span>
              <span
                className="text-sm font-bold"
                style={{
                  color: operationalAlerts.unassignedBookingRooms > 0 ? 'var(--yellow)' : 'var(--green)',
                }}
              >
                {operationalAlerts.unassignedBookingRooms}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
              <span className="text-sm">إيراد الغرف المستحق (Accrued)</span>
              <span className="text-sm font-bold">{formatMoney(kpis.accruedRoomRevenue)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
              <span className="text-sm">الضريبة المحتسبة</span>
              <span className="text-sm font-bold">{formatMoney(kpis.taxTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
