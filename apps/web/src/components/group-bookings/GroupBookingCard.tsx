'use client';

import { useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { apiPut } from '@/lib/utils/api-mutation';
import type { GroupBookingData, RoutingRuleData, FolioData } from './types';
import { AssignBookingsModal } from './AssignBookingsModal';
import { CreateSubBookingModal } from './CreateSubBookingModal';
import { GroupReportModal } from './GroupReportModal';

interface Props {
  group: GroupBookingData;
  hotelId: string;
  onRefresh: () => void;
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  ROOM_CHARGE: 'إيجار الغرفة',
  SERVICE: 'خدمات',
  TAX: 'الضرائب',
  DISCOUNT: 'الخصومات',
  RESTAURANT: 'المطعم',
  SAFE_DEPOSIT: 'صندوق الأمانات',
};

function folioBalance(folio: FolioData | null) {
  if (!folio) return { text: '—', color: '' };
  const bal = Number(folio.balance);
  if (bal > 0) return { text: `${bal} د.ل`, color: 'text-[var(--red)]' };
  if (bal === 0) return { text: '0 د.ل', color: 'text-[var(--green)]' };
  return { text: `${Math.abs(bal)} د.ل`, color: 'text-[var(--gold)]' };
}

export function GroupBookingCard({ group, hotelId, onRefresh }: Props) {
  const [showAssign, setShowAssign] = useState(false);
  const [showSubBooking, setShowSubBooking] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editingRules, setEditingRules] = useState(false);
  const [rules, setRules] = useState<RoutingRuleData[]>(group.routingRules);
  const [saving, setSaving] = useState(false);

  const masterBalance = folioBalance(group.masterFolio);

  async function handleSaveRules() {
    setSaving(true);
    const payload = rules.map(r => ({
      chargeType: r.chargeType,
      targetFolioId: r.targetFolioId,
    }));

    await apiPut(`/api/admin/group-bookings/${group.id}/routing`, { rules: payload }, {
      successMsg: '✅ تم تحديث قواعد التوجيه',
      errorMsg: 'فشل تحديث القواعد',
      onSuccess: () => {
        setEditingRules(false);
        onRefresh();
      },
    });

    setSaving(false);
  }

  function toggleRuleFolio(chargeType: string, folioId: string) {
    setRules(prev =>
      prev.map(r => r.chargeType === chargeType ? { ...r, targetFolioId: folioId } : r)
    );
  }

  const subFolios = group.bookings
    .filter(b => b.folio)
    .map(b => ({ booking: b, folio: b.folio! }));

  const allFolios = [
    { id: group.masterFolio?.id || '', label: '📋 الفاتورة الرئيسية' },
    ...subFolios.map(sf => ({
      id: sf.folio.id,
      label: `🚪 ${sf.booking.rooms?.[0]?.room?.roomNumber || ''} - ${sf.booking.guestName || ''}`,
    })),
  ];

  return (
    <>
      <Card
        title={`👥 ${group.name}`}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowReport(true)}>
              📊 تقرير المجموعة الموحّد
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowAssign(true)}>
              + إضافة حجوزات
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSubBooking(true)}>
              ➕ حجز فرعي
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingRules(!editingRules)}>
              {editingRules ? 'إلغاء' : '⚙️ التوجيه'}
            </Button>
          </div>
        }
      >
        {/* Master Folio */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-[var(--bg-card-hover)] rounded-xl p-4">
            <div className="text-sm text-[var(--text-muted)] mb-1">الفاتورة الرئيسية</div>
            <div className={`text-xl font-bold ${masterBalance.color}`}>{masterBalance.text}</div>
            <div className="text-xs text-[var(--text-muted)]">
              الإجمالي: {group.masterFolio?.totalCharges || 0} | المدفوع: {group.masterFolio?.totalPaid || 0}
            </div>
          </div>
          <div className="bg-[var(--bg-card-hover)] rounded-xl p-4">
            <div className="text-sm text-[var(--text-muted)] mb-1">عدد الحجوزات</div>
            <div className="text-xl font-bold">{group.bookings.length}</div>
          </div>
          <div className="bg-[var(--bg-card-hover)] rounded-xl p-4">
            <div className="text-sm text-[var(--text-muted)] mb-1">الضيوف</div>
            <div className="text-xl font-bold">
              {group.bookings.reduce((sum, b) => sum + (b.guest ? 1 : 0), 0)}
            </div>
          </div>
        </div>

        {/* Routing Rules Editor */}
        {editingRules && (
          <div className="mb-4 p-4 border border-[var(--border)] rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">⚙️ قواعد التوجيه (Routing)</h4>
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-card)] px-2 py-1 rounded-full">
                تحدد أي فاتورة تتحمل كل نوع من الرسوم
              </span>
            </div>

            <div className="bg-[rgba(52,152,219,0.08)] border border-[var(--blue)]/30 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-[var(--blue)]">📋 الفاتورة الرئيسية (Master Folio)</p>
              <p className="text-[var(--text-muted)]">
                تجمع جميع الرسوم التي لم تُوجّه إلى فاتورة فرعية معينة. تُستخدم للدفع الموحد للمجموعة.
              </p>
              <p className="font-semibold text-[var(--gold)] mt-2">🚪 الفواتير الفرعية (Sub-Folios)</p>
              <p className="text-[var(--text-muted)]">
                كل حجز له فاتورته الخاصة. يمكن توجيه أنواع رسوم محددة (مثل الخدمات) إلى فاتورة غرفة معينة أو إلى الفاتورة الرئيسية.
              </p>
            </div>

            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.chargeType} className="flex items-center gap-3">
                  <span className="text-sm w-36 font-medium">{CHARGE_TYPE_LABELS[rule.chargeType] || rule.chargeType}</span>
                  <svg className="w-4 h-4 text-[var(--text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <select
                    value={rule.targetFolioId}
                    onChange={e => toggleRuleFolio(rule.chargeType, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm"
                  >
                    {allFolios.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
              <Button size="sm" variant="secondary" onClick={() => { setEditingRules(false); setRules(group.routingRules); }}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleSaveRules} loading={saving}>💾 حفظ قواعد التوجيه</Button>
            </div>
          </div>
        )}

        {/* Bookings List */}
        <div className="space-y-2">
          <h4 className="font-bold text-sm text-[var(--text-muted)]">الحجوزات</h4>
          {group.bookings.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] text-center py-4">
              لا توجد حجوزات مضافة بعد
            </div>
          ) : (
            group.bookings.map(b => {
              const bal = folioBalance(b.folio);
              return (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card-hover)]">
                  <div>
                    <div className="font-bold text-sm">{b.guestName || b.bookingNo}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {b.bookingNo}
                      {b.rooms?.[0] && ` — غرفة ${b.rooms[0].room.roomNumber}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${bal.color}`}>{bal.text}</span>
                    <Badge variant={b.status === 'CHECKED_IN' ? 'green' : 'blue'}>
                      {b.status === 'CHECKED_IN' ? 'مقيم' : b.status}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <AssignBookingsModal
        open={showAssign}
        onClose={() => setShowAssign(false)}
        onSuccess={onRefresh}
        groupId={group.id}
        hotelId={hotelId}
      />
      <CreateSubBookingModal
        open={showSubBooking}
        onClose={() => setShowSubBooking(false)}
        onSuccess={onRefresh}
        groupId={group.id}
        hotelId={hotelId}
      />
      <GroupReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        groupId={group.id}
        groupName={group.name}
      />
    </>
  );
}
