'use client';

import { useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { apiPut } from '@/lib/utils/api-mutation';
import type { GroupBookingData, RoutingRuleData, FolioData } from './types';
import { AssignBookingsModal } from './AssignBookingsModal';

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
            <Button size="sm" variant="secondary" onClick={() => setShowAssign(true)}>
              + إضافة حجوزات
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
          <div className="mb-4 p-4 border border-[var(--border)] rounded-xl space-y-3">
            <h4 className="font-bold text-sm">قواعد التوجيه</h4>
            {rules.map(rule => (
              <div key={rule.chargeType} className="flex items-center gap-3">
                <span className="text-sm w-32">{CHARGE_TYPE_LABELS[rule.chargeType] || rule.chargeType}</span>
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
            <div className="flex gap-2 justify-end pt-2">
              <Button size="sm" variant="secondary" onClick={() => { setEditingRules(false); setRules(group.routingRules); }}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleSaveRules} loading={saving}>حفظ</Button>
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
    </>
  );
}
