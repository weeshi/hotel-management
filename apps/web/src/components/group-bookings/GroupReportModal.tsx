'use client';

import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';
import type {
  GroupReportData,
  GroupReportCategoryBreakdown,
  GroupReportMemberBreakdown,
} from './types';

interface GroupReportModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  ROOM_CHARGE: 'إيجار الغرفة',
  SERVICE: 'خدمات',
  RESTAURANT: 'المطعم',
  TAX: 'الضرائب',
  DISCOUNT: 'الخصومات',
  SAFE_DEPOSIT: 'صندوق الأمانات',
  PAYMENT: 'مدفوعات',
  REFUND: 'استرداد',
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'نقداً',
  MOBICASH: 'موبي كاش',
  SADAD: 'سداد',
  TADAWUL: 'تداول',
  WALLET: 'المحفظة',
  CARD: 'بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار التأكيد',
  CONFIRMED: 'مؤكد',
  CHECKED_IN: 'مقيم',
  CHECKED_OUT: 'مغادر',
  CANCELLED: 'ملغى',
};

function formatAmount(value: number): string {
  return value.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-LY');
}

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] || key;
}

function methodLabel(key: string): string {
  return METHOD_LABELS[key] || key;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

function balanceColor(value: number): string {
  if (value > 0) return 'text-[var(--red)]';
  if (value < 0) return 'text-[var(--gold)]';
  return 'text-[var(--green)]';
}

function BreakdownTable({
  title,
  entries,
  labelFor,
}: {
  title: string;
  entries: Record<string, GroupReportCategoryBreakdown>;
  labelFor: (key: string) => string;
}) {
  const rows = Object.entries(entries);
  return (
    <div>
      <h4 className="font-bold text-sm mb-2">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">لا توجد بيانات.</p>
      ) : (
        <table className="w-full text-xs border border-[var(--border)] rounded-lg overflow-hidden">
          <thead className="bg-[var(--bg-secondary)] text-[var(--text-muted)]">
            <tr>
              <th className="text-right px-3 py-2 font-medium">البند</th>
              <th className="text-left px-3 py-2 font-medium">الفاتورة الرئيسية</th>
              <th className="text-left px-3 py-2 font-medium">الفواتير الفرعية</th>
              <th className="text-left px-3 py-2 font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, value]) => (
              <tr key={key} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{labelFor(key)}</td>
                <td className="px-3 py-2 text-left">{formatAmount(value.masterAmount)}</td>
                <td className="px-3 py-2 text-left">{formatAmount(value.subFoliosAmount)}</td>
                <td className="px-3 py-2 text-left font-bold">{formatAmount(value.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MemberRow({ member }: { member: GroupReportMemberBreakdown }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="px-3 py-2">
        <span className="font-semibold">{member.guestName || member.bookingNo}</span>
        <span className="block text-[10px] text-[var(--text-muted)]">{member.bookingNo}</span>
      </td>
      <td className="px-3 py-2">{statusLabel(member.status)}</td>
      <td className="px-3 py-2">
        {member.roomNumbers.length > 0 ? member.roomNumbers.join('، ') : '—'}
        {member.unassignedCount > 0 && (
          <span className="block text-[10px] text-[var(--gold)]">
            {member.unassignedCount} بانتظار التخصيص
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-left">{member.nights}</td>
      <td className="px-3 py-2 text-left">{formatAmount(member.totalCharges)}</td>
      <td className="px-3 py-2 text-left">{formatAmount(member.totalPaid)}</td>
      <td className={`px-3 py-2 text-left font-bold ${balanceColor(member.balance)}`}>
        {formatAmount(member.balance)}
      </td>
    </tr>
  );
}

export function GroupReportModal({ open, onClose, groupId, groupName }: GroupReportModalProps) {
  const [report, setReport] = useState<GroupReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setReport(null);
    setReportError(null);
    setIsLoading(true);

    apiGet<GroupReportData>(`/api/admin/group-bookings/${groupId}/report`).then((response) => {
      if (cancelled) return;
      if (response.success) {
        setReport(response.data);
      } else {
        setReportError(response.error.message);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, groupId]);

  const occupancy = report?.occupancySummary;
  const financial = report?.financialSummary;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📊 تقرير المجموعة الموحّد — ${report?.group.name || groupName || ''}`}
      size="lg"
    >
      <div data-component="group-report-modal" className="space-y-5">
        {isLoading && <p className="text-sm text-[var(--text-muted)]">جارٍ تحميل التقرير...</p>}

        {!isLoading && reportError && <p className="text-sm text-[var(--red)]">{reportError}</p>}

        {!isLoading && report && (
          <div data-print-root className="space-y-5">
            {/* Meta + print */}
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs text-[var(--text-muted)] space-y-1">
                {report.group.companyName && <div>الشركة: {report.group.companyName}</div>}
                {report.group.contactName && <div>جهة الاتصال: {report.group.contactName}</div>}
                {report.group.contactPhone && <div>الهاتف: {report.group.contactPhone}</div>}
                {report.group.contactEmail && <div>البريد: {report.group.contactEmail}</div>}
                <div>
                  الفترة: {formatDate(report.group.checkIn)} → {formatDate(report.group.checkOut)}
                </div>
                {report.group.notes && <div>ملاحظات: {report.group.notes}</div>}
              </div>
              <div data-print-hide>
                <Button size="sm" variant="secondary" onClick={() => window.print()}>
                  🖨️ طباعة التقرير
                </Button>
              </div>
            </div>

            {/* Occupancy KPIs */}
            {occupancy && (
              <div>
                <h4 className="font-bold text-sm mb-2">الإشغال</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">الحجوزات النشطة</div>
                    <div className="text-lg font-bold">{occupancy.totalBookings}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">ملغاة</div>
                    <div className="text-lg font-bold">{occupancy.cancelledBookings}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">الغرف الكلية</div>
                    <div className="text-lg font-bold">{occupancy.totalRooms}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">ليالٍ غرف</div>
                    <div className="text-lg font-bold">{occupancy.totalRoomNights}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">مخصّصة</div>
                    <div className="text-lg font-bold text-[var(--green)]">{occupancy.assignedRooms}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">بانتظار التخصيص</div>
                    <div className="text-lg font-bold text-[var(--gold)]">{occupancy.unassignedRooms}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">البالغون</div>
                    <div className="text-lg font-bold">{occupancy.totalGuests.adults}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-card-hover)] p-3">
                    <div className="text-[var(--text-muted)]">الأطفال</div>
                    <div className="text-lg font-bold">{occupancy.totalGuests.children}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
                  {Object.entries(occupancy.statusBreakdown).map(([status, count]) => (
                    <span key={status}>
                      {statusLabel(status)}: <strong className="text-[var(--text-primary)]">{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Financial comparison */}
            {financial && (
              <div>
                <h4 className="font-bold text-sm mb-2">المقارنة المالية (رئيسية / فرعية / موحّدة)</h4>
                <table className="w-full text-xs border border-[var(--border)] rounded-lg overflow-hidden">
                  <thead className="bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium">الفاتورة</th>
                      <th className="text-left px-3 py-2 font-medium">الرسوم</th>
                      <th className="text-left px-3 py-2 font-medium">المدفوع</th>
                      <th className="text-left px-3 py-2 font-medium">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">الرئيسية</td>
                      <td className="px-3 py-2 text-left">
                        {formatAmount(financial.masterFolio?.totalCharges || 0)}
                      </td>
                      <td className="px-3 py-2 text-left">
                        {formatAmount(financial.masterFolio?.totalPaid || 0)}
                      </td>
                      <td className={`px-3 py-2 text-left ${balanceColor(financial.masterFolio?.balance || 0)}`}>
                        {formatAmount(financial.masterFolio?.balance || 0)}
                      </td>
                    </tr>
                    <tr className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">الفرعية</td>
                      <td className="px-3 py-2 text-left">{formatAmount(financial.subFoliosTotals.totalCharges)}</td>
                      <td className="px-3 py-2 text-left">{formatAmount(financial.subFoliosTotals.totalPaid)}</td>
                      <td className={`px-3 py-2 text-left ${balanceColor(financial.subFoliosTotals.balance)}`}>
                        {formatAmount(financial.subFoliosTotals.balance)}
                      </td>
                    </tr>
                    <tr className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
                      <td className="px-3 py-2 font-bold">الموحّد</td>
                      <td className="px-3 py-2 text-left font-bold">
                        {formatAmount(financial.consolidatedTotals.totalCharges)}
                      </td>
                      <td className="px-3 py-2 text-left font-bold">
                        {formatAmount(financial.consolidatedTotals.totalPaid)}
                      </td>
                      <td className={`px-3 py-2 text-left font-bold ${balanceColor(financial.consolidatedTotals.balance)}`}>
                        {formatAmount(financial.consolidatedTotals.balance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Category + payment breakdowns */}
            {financial && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BreakdownTable
                  title="الرسوم حسب الفئة"
                  entries={financial.chargesByCategory}
                  labelFor={categoryLabel}
                />
                <BreakdownTable
                  title="المدفوعات حسب الطريقة"
                  entries={financial.paymentsByMethod}
                  labelFor={methodLabel}
                />
              </div>
            )}

            {/* Member bookings table */}
            {report.memberBreakdown.length > 0 && (
              <div>
                <h4 className="font-bold text-sm mb-2">حجوزات المجموعة</h4>
                <table className="w-full text-xs border border-[var(--border)] rounded-lg overflow-hidden">
                  <thead className="bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium">الضيف</th>
                      <th className="text-right px-3 py-2 font-medium">الحالة</th>
                      <th className="text-right px-3 py-2 font-medium">الغرف</th>
                      <th className="text-left px-3 py-2 font-medium">ليالٍ</th>
                      <th className="text-left px-3 py-2 font-medium">الرسوم</th>
                      <th className="text-left px-3 py-2 font-medium">المدفوع</th>
                      <th className="text-left px-3 py-2 font-medium">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.memberBreakdown.map((member) => (
                      <MemberRow key={member.bookingId} member={member} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Routing rules */}
            {report.routingRules.length > 0 && (
              <div>
                <h4 className="font-bold text-sm mb-2">قواعد التوجيه</h4>
                <ul className="text-xs space-y-1 text-[var(--text-muted)]">
                  {report.routingRules.map((rule) => (
                    <li key={rule.id}>
                      {categoryLabel(rule.chargeType)} → فاتورة {rule.targetFolioId.slice(0, 8)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2" data-print-hide>
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
    </Modal>
  );
}
