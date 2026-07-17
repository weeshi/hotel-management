'use client';

import { Card, Badge } from '@/components/ui';

interface FolioEntry {
  bookingId: string;
  bookingNo: string;
  checkIn: string;
  checkOut: string;
  status: string;
  folio: {
    id: string;
    status: string;
    totalCharges: number;
    totalPaid: number;
    balance: number;
  } | null;
}

import { Button } from '@/components/ui';

interface Props {
  folios: FolioEntry[];
  basePath: string;
  onViewFolio?: (entry: FolioEntry) => void;
}

export function GuestFolioList({ folios, basePath, onViewFolio }: Props) {
  if (!folios.length) {
    return <div className="text-center py-8 text-[var(--text-muted)] text-sm">لا توجد فواتير لهذا النزيل</div>;
  }

  return (
    <div className="space-y-3">
      {folios.map((entry) => {
        if (!entry.folio) return null;
        const f = entry.folio;
        return (
          <Card key={f.id} className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold">فاتورة - حجز #{entry.bookingNo}</h4>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {new Date(entry.checkIn).toLocaleDateString('ar-LY')} → {new Date(entry.checkOut).toLocaleDateString('ar-LY')}
                </div>
              </div>
              <Badge variant={f.balance > 0 ? 'red' : 'green'}>
                {f.balance > 0 ? 'غير مسددة' : 'مسددة'}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
              <div>
                <div className="text-[var(--text-muted)] text-xs">إجمالي الرسوم</div>
                <div className="font-bold">{f.totalCharges} د.ل</div>
              </div>
              <div>
                <div className="text-[var(--text-muted)] text-xs">المدفوع</div>
                <div className="font-bold text-green-600">{f.totalPaid} د.ل</div>
              </div>
              <div>
                <div className="text-[var(--text-muted)] text-xs">الرصيد المتبقي</div>
                <div className={`font-bold ${f.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {f.balance} د.ل
                </div>
              </div>
            </div>
            {onViewFolio && (
              <div className="border-t border-[var(--border)] pt-3">
                <Button size="sm" variant="secondary" onClick={() => onViewFolio(entry)}>💰 عرض الفاتورة</Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
