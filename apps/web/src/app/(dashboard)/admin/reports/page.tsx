'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@/components/ui';
import { PeriodSelector, StatCards, ReportTypeTabs, ExportButtons, ShareReportModal, ReportSettingsModal, ExecutiveKpiPanel } from '@/components/reports';

const periodOptions = [
  { value: 'day', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'year', label: 'السنة' },
  { value: 'all', label: 'الكل' },
];

function getPeriodDates(period: string) {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  let from: string;
  switch (period) {
    case 'day': from = now.toISOString().split('T')[0]; break;
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString().split('T')[0]; break; }
    case 'month': { const d = new Date(now); d.setMonth(d.getMonth() - 1); from = d.toISOString().split('T')[0]; break; }
    case 'year': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); from = d.toISOString().split('T')[0]; break; }
    default: return { dateFrom: undefined, dateTo: undefined };
  }
  return { dateFrom: from, dateTo: to };
}

export default function AdminReportsPage() {
  const [reportType, setReportType] = useState('occupancy');
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { dateFrom, dateTo } = getPeriodDates(period);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/admin/reports/${reportType}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.success) setData(d.data);
    } finally { setLoading(false); }
  }, [reportType, dateFrom, dateTo]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function buildStatCards(): { icon: string; value: string; label: string; color: string }[] {
    if (!data || !data.summary) return [];
    const s = data.summary;
    switch (reportType) {
      case 'occupancy':
        return [
          { icon: '🛏️', value: String(s.totalRooms), label: 'إجمالي الغرف', color: 'var(--gold)' },
          { icon: '🟢', value: String(s.availableRooms), label: 'متاح', color: 'var(--green)' },
          { icon: '🔴', value: String(s.occupiedRooms), label: 'مشغول', color: 'var(--red)' },
          { icon: '📊', value: `${s.occupancyPercent}%`, label: 'نسبة الإشغال', color: 'var(--gold)' },
        ];
      case 'revenue':
        return [
          { icon: '💰', value: Number(s.totalRevenue || 0).toFixed(2), label: 'إجمالي الإيرادات', color: 'var(--gold)' },
          { icon: '🏷️', value: Number(s.totalCharges || 0).toFixed(2), label: 'الرسوم', color: 'var(--blue)' },
          { icon: '📉', value: Number(s.totalDiscounts || 0).toFixed(2), label: 'الخصومات', color: 'var(--red)' },
          { icon: '✅', value: Number(s.netRevenue || 0).toFixed(2), label: 'الصافي', color: 'var(--green)' },
        ];
      case 'housekeeping':
        return [
          { icon: '📋', value: String(s.total), label: 'إجمالي المهام', color: 'var(--gold)' },
          { icon: '✅', value: String(s.completed), label: 'مكتمل', color: 'var(--green)' },
          { icon: '⏳', value: String(s.pending), label: 'قيد الانتظار', color: 'var(--yellow)' },
          { icon: '📊', value: `${s.completionRate}%`, label: 'نسبة الإنجاز', color: 'var(--blue)' },
        ];
      case 'restaurant':
        return [
          { icon: '🍽️', value: String(s.totalOrders), label: 'إجمالي الطلبات', color: 'var(--gold)' },
          { icon: '💰', value: Number(s.totalRevenue || 0).toFixed(2), label: 'الإيرادات', color: 'var(--green)' },
          { icon: '📊', value: Number(s.averageOrderValue || 0).toFixed(2), label: 'متوسط الطلب', color: 'var(--blue)' },
        ];
      case 'safe-deposit':
        return [
          { icon: '🔐', value: String(s.total), label: 'إجمالي الصناديق', color: 'var(--gold)' },
          { icon: '🟢', value: String(s.active), label: 'نشط', color: 'var(--green)' },
          { icon: '🔒', value: String(s.closed), label: 'مغلق', color: 'var(--text-muted)' },
          { icon: '⏱️', value: `${s.avgDurationHours || 0}`, label: 'متوسط المدة (ساعة)', color: 'var(--blue)' },
        ];
      case 'wallet':
        return [
          { icon: '👛', value: String(s.totalWallets), label: 'إجمالي المحافظ', color: 'var(--gold)' },
          { icon: '💰', value: Number(s.totalBalance).toFixed(2), label: 'الرصيد الكلي', color: 'var(--gold)' },
          { icon: '📈', value: Number(s.totalTopUp).toFixed(2), label: 'إجمالي الإيداعات', color: 'var(--green)' },
          { icon: '📉', value: Number(s.totalWithdrawal).toFixed(2), label: 'إجمالي السحوبات', color: 'var(--red)' },
        ];
      case 'lost-found':
        return [
          { icon: '📦', value: String(s.total), label: 'إجمالي العناصر', color: 'var(--gold)' },
          { icon: '⏳', value: String(s.pending), label: 'قيد الانتظار', color: 'var(--yellow)' },
          { icon: '✅', value: String(s.claimed), label: 'مستلم', color: 'var(--green)' },
          { icon: '📊', value: `${s.claimRate || 0}%`, label: 'معدل الاستلام', color: 'var(--blue)' },
        ];
      default:
        return [];
    }
  }

  function renderDetails() {
    if (!data) return null;

    switch (reportType) {
      case 'occupancy':
        return (
          <div className="space-y-4">
            {data.byRoomType?.length > 0 && (
              <Card className="!p-4">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">حسب فئة الغرفة</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs"><th className="text-right p-2">الفئة</th><th className="text-right p-2">المجموع</th><th className="text-right p-2">مشغول</th><th className="text-right p-2">النسبة</th></tr></thead>
                  <tbody>{data.byRoomType.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-[var(--border)]"><td className="p-2">{r.typeName}</td><td className="p-2">{r.total}</td><td className="p-2">{r.occupied}</td><td className="p-2">{r.occupancyPercent}%</td></tr>
                  ))}</tbody>
                </table>
              </Card>
            )}
            {data.byFloor?.length > 0 && (
              <Card className="!p-4">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">حسب الطابق</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs"><th className="text-right p-2">الطابق</th><th className="text-right p-2">المجموع</th><th className="text-right p-2">مشغول</th><th className="text-right p-2">النسبة</th></tr></thead>
                  <tbody>{data.byFloor.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-[var(--border)]"><td className="p-2">ط{r.floor}</td><td className="p-2">{r.total}</td><td className="p-2">{r.occupied}</td><td className="p-2">{r.occupancyPercent}%</td></tr>
                  ))}</tbody>
                </table>
              </Card>
            )}
          </div>
        );
      case 'wallet':
        return (
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="!p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">طرق الدفع - الإيداعات</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs"><th className="text-right p-2">الطريقة</th><th className="text-right p-2">المبلغ</th><th className="text-right p-2">العدد</th></tr></thead>
                <tbody>{(data.byPaymentMethod?.topUp || []).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--border)]"><td className="p-2">{r.method === 'CASH' ? '💰 نقداً' : r.method === 'BANK_TRANSFER' ? '🏦 حوالة بنكية' : r.method === 'CARD' ? '💳 بطاقة' : r.method === 'POS' ? '🏧 نقاط بيع' : r.method || '—'}</td><td className="p-2 text-green-600 font-bold">+{Number(r.total).toFixed(2)}</td><td className="p-2">{r.count}</td></tr>
                ))}</tbody>
              </table>
            </Card>
            <Card className="!p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">طرق الدفع - السحوبات</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs"><th className="text-right p-2">الطريقة</th><th className="text-right p-2">المبلغ</th><th className="text-right p-2">العدد</th></tr></thead>
                <tbody>{(data.byPaymentMethod?.withdrawal || []).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--border)]"><td className="p-2">{r.method === 'CASH' ? '💰 نقداً' : r.method === 'BANK_TRANSFER' ? '🏦 حوالة بنكية' : r.method === 'CARD' ? '💳 بطاقة' : r.method === 'POS' ? '🏧 نقاط بيع' : r.method || '—'}</td><td className="p-2 text-red-600 font-bold">-{Number(r.total).toFixed(2)}</td><td className="p-2">{r.count}</td></tr>
                ))}</tbody>
              </table>
            </Card>
            {data.byEmployee?.length > 0 && (
              <Card className="!p-4">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">حسب الموظف</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs"><th className="text-right p-2">الموظف</th><th className="text-right p-2">المبلغ</th><th className="text-right p-2">العدد</th></tr></thead>
                  <tbody>{data.byEmployee.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-[var(--border)]"><td className="p-2">{r.employeeName}</td><td className="p-2">{Number(r.total).toFixed(2)}</td><td className="p-2">{r.count}</td></tr>
                  ))}</tbody>
                </table>
              </Card>
            )}
            {data.topWallets?.length > 0 && (
              <Card className="!p-4">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">أكبر المعاملات</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs"><th className="text-right p-2">النزيل</th><th className="text-right p-2">النوع</th><th className="text-right p-2">المبلغ</th><th className="text-right p-2">طريقة الدفع</th></tr></thead>
                  <tbody>{data.topWallets.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-[var(--border)]"><td className="p-2">{r.guestName}</td><td className="p-2">{r.type === 'TOP_UP' ? 'إيداع' : 'سحب'}</td><td className={`p-2 font-bold ${r.type === 'TOP_UP' ? 'text-green-600' : 'text-red-600'}`}>{r.type === 'TOP_UP' ? '+' : '-'}{Number(r.amount).toFixed(2)}</td><td className="p-2">{r.method === 'CASH' ? '💰 نقداً' : r.method === 'BANK_TRANSFER' ? '🏦 حوالة بنكية' : r.method === 'CARD' ? '💳 بطاقة' : r.method === 'POS' ? '🏧 نقاط بيع' : r.method || '—'}</td></tr>
                  ))}</tbody>
                </table>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  const stats = buildStatCards();

  return (
    <div data-component="AdminReportsPage">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">📊 التقارير المتقدمة</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowSettings(true)}>⚙️ الإعدادات</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <ReportTypeTabs value={reportType} onChange={setReportType} />
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} options={periodOptions} onChange={setPeriod} />
        </div>
      </div>

      <div className="mb-6">
        <ExecutiveKpiPanel startDate={dateFrom} endDate={dateTo} />
      </div>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <ExportButtons type={reportType} dateFrom={dateFrom} dateTo={dateTo} />
          <Button variant="secondary" onClick={() => setShowShare(true)}>📧 مشاركة</Button>
        </div>
        {dateFrom && (
          <div className="text-xs text-[var(--text-muted)]">
            من {dateFrom} إلى {dateTo}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-[var(--text-muted)]">لا توجد بيانات</div>
      ) : (
        <div className="space-y-6">
          {stats.length > 0 && <StatCards items={stats} />}
          {renderDetails()}
        </div>
      )}

      <ShareReportModal
        open={showShare}
        onClose={() => setShowShare(false)}
        reportType={reportType}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
      <ReportSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
