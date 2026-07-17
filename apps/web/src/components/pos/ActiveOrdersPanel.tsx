'use client';

import type { RestaurantOrder } from './types';

const orderStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  PREPARING: 'bg-blue-500/20 text-blue-400',
  READY: 'bg-green-500/20 text-green-400',
  SERVED: 'bg-[var(--gold)]/20 text-[var(--gold)]',
  COMPLETED: 'bg-gray-500/20 text-gray-400',
  PAID: 'bg-emerald-500/20 text-emerald-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
};

const orderStatusLabels: Record<string, string> = {
  PENDING: 'معلق',
  PREPARING: 'تحضير',
  READY: 'جاهز',
  SERVED: 'مقدم',
  COMPLETED: 'مكتمل',
  PAID: 'مدفوع',
  CANCELLED: 'ملغي',
};

interface Props {
  orders: RestaurantOrder[];
  onSettle?: (order: RestaurantOrder) => void;
}

export function ActiveOrdersPanel({ orders, onSettle }: Props) {
  const active = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'PAID');
  if (active.length === 0) return null;

  return (
    <div data-component="ActiveOrdersPanel" className="w-64 shrink-0 flex flex-col bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="p-3 border-b border-[var(--border)]">
        <h2 className="font-bold text-sm">📋 الطلبات النشطة</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {active.map(order => (
          <div key={order.id} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">{order.orderNo}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${orderStatusColors[order.status] || ''}`}>
                {orderStatusLabels[order.status] || order.status}
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {order.orderType === 'DINE_IN' ? `طاولة ${order.tableNo}` : order.orderType === 'ROOM_SERVICE' ? `غرفة ${order.roomNo}` : 'محمول'}
              {order.booking && (
                <span className="mr-1">· {order.booking.guestName}</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[var(--gold)] font-semibold">{order.totalAmount.toFixed(2)} د.ل</span>
              {onSettle && (
                <button
                  type="button"
                  onClick={() => onSettle(order)}
                  className="text-[10px] px-2 py-1 rounded-lg bg-[var(--gold)] text-black font-semibold hover:opacity-80 transition-opacity"
                >
                  تسوية
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
