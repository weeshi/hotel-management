'use client';

import { Badge, Button } from '@/components/ui';
import type { FolioSummary, RestaurantOrder } from './types';

interface Props {
  folio: FolioSummary;
  restaurantOrders: RestaurantOrder[];
  hasUnchargedOrders: boolean;
  onAddCharge: () => void;
  onAddService: () => void;
  onDiscount: () => void;
  onInvoice: () => void;
  onPayment: (balance: number) => void;
  onShowRestaurantOrders: () => void;
  onDownloadPdf?: () => void;
  onVoidTransaction?: (transactionId: string, description: string, amount: number) => void;
}

export function FolioDetails({
  folio, restaurantOrders, hasUnchargedOrders,
  onAddCharge, onAddService, onDiscount, onInvoice, onPayment, onShowRestaurantOrders, onDownloadPdf, onVoidTransaction,
}: Props) {
  return (
    <div className="bg-gradient-to-br from-[#0F0F18] to-[#161620] border border-[var(--border-gold)] rounded-xl p-6 max-w-2xl mx-auto mb-6">
      <div className="flex items-center justify-between border-b border-dashed border-[var(--border)] pb-3 mb-4">
        <h2 className="text-[var(--gold)] font-bold text-lg">FOLIO</h2>
        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--text-muted)] text-left leading-tight">
            <div>{folio.folioNo}</div>
            <div>#{folio.bookingNo}</div>
          </div>
          <Badge variant={folio.balance > 0 ? 'red' : 'green'}>
            {folio.balance > 0 ? 'غير مسدد' : 'مسدد'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-4 bg-[var(--bg-secondary)] rounded-xl p-4">
        <div>
          <div className="text-xs text-[var(--text-muted)]">رقم الفاتورة المالية</div>
          <div className="font-bold font-mono text-xs">{folio.folioNo}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">رقم الحجز المرجعي</div>
          <div className="font-bold font-mono text-xs">{folio.bookingNo}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">النزيل</div>
          <div className="font-bold">{folio.guest.name}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">الحالة</div>
          <div className={`font-bold ${folio.balance > 0 ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>
            {folio.balance > 0 ? '⚠️ غير مسدد' : '✅ مسدد'}
          </div>
        </div>
        {folio.guest.email && (
          <div className="col-span-2">
            <div className="text-xs text-[var(--text-muted)]">البريد</div>
            <div>{folio.guest.email}</div>
          </div>
        )}
      </div>

      {folio.rooms.length > 0 && (
        <div className="mb-4 space-y-1">
          {folio.rooms.map((room, i) => (
            <div key={i} className="text-xs text-[var(--text-muted)]">
              الغرفة {room.number}: {new Date(room.checkIn).toLocaleDateString('ar-LY')} ← {new Date(room.checkOut).toLocaleDateString('ar-LY')} ({room.nightlyRate} د.ل/ليلة)
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 text-sm">
        {folio.transactions.map((tx: any) => (
          <div key={tx.id} className="flex items-center justify-between group">
            <div className="flex items-center gap-2">
              {(folio.status === 'ACTIVE' || folio.balance > 0) && onVoidTransaction && tx.amount > 0 && (
                <button onClick={() => onVoidTransaction(tx.id, tx.description, tx.amount)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--red)] hover:text-red-400 text-xs transition-opacity" title="إلغاء المعاملة">
                  ✕
                </button>
              )}
              <span className="text-[var(--text-secondary)]">{tx.description}</span>
            </div>
            <span className={`font-semibold ${tx.amount >= 0 ? 'text-[var(--text-primary)]' : 'text-[var(--green)]'}`}>
              {tx.amount >= 0 ? '+ ' : ''}{Math.abs(Number(tx.amount)).toFixed(2)} د.ل
            </span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-[var(--border)] font-bold">
          <span>الإجمالي</span>
          <span className="text-[var(--gold)]">{folio.totalCharges.toFixed(2)} د.ل</span>
        </div>
        <div className="flex justify-between text-xs text-[var(--green)]">
          <span>✅ مدفوع</span>
          <span>{folio.totalPaid.toFixed(2)} د.ل</span>
        </div>
        <div className="flex justify-between pt-2 border-t-2 border-[var(--gold)] font-bold text-lg">
          <span>⏳ المتبقي</span>
          <span className={folio.balance > 0 ? 'text-[var(--gold)]' : 'text-[var(--green)]'}>
            {folio.balance.toFixed(2)} د.ل
          </span>
        </div>
      </div>

      {restaurantOrders.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-[var(--gold)]">🍽️ طلبات المطعم</h3>
            {hasUnchargedOrders && (
              <button onClick={onShowRestaurantOrders} className="text-xs text-[var(--blue)] hover:underline">شحن الكل</button>
            )}
          </div>
          {restaurantOrders.slice(0, 3).map(order => (
            <div key={order.id} className="flex items-center justify-between py-1 text-xs">
              <span className="text-[var(--text-secondary)]">#{order.orderNo}</span>
              <span className={['PENDING', 'PREPARING', 'READY', 'SERVED'].includes(order.status) ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'}>
                {order.totalAmount.toFixed(2)} د.ل
              </span>
            </div>
          ))}
          {restaurantOrders.length > 3 && (
            <button onClick={onShowRestaurantOrders} className="text-xs text-[var(--blue)] hover:underline mt-1">عرض الكل ({restaurantOrders.length})</button>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-6 flex-wrap">
        <Button size="sm" variant="secondary" onClick={onAddCharge}>➕ إضافة رسوم</Button>
        <Button size="sm" variant="secondary" onClick={onAddService}>🛎️ خدمة</Button>
        <Button size="sm" variant="secondary" onClick={onDiscount}>🏷️ خصم</Button>
        <Button size="sm" variant="ghost" onClick={onDownloadPdf}>📄 PDF</Button>
        <Button size="sm" variant="secondary" onClick={onInvoice}>🧾 الفاتورة</Button>
        {folio.balance > 0 ? (
          <Button size="sm" onClick={() => onPayment(folio.balance)}>💳 دفع</Button>
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[rgba(46,204,113,0.1)] text-[var(--green)] text-sm font-semibold whitespace-nowrap">✅ مسدد</span>
        )}
      </div>
    </div>
  );
}
