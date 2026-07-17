'use client';

import { Modal, Button } from '@/components/ui';
import type { RestaurantOrder } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  orders: RestaurantOrder[];
  loading: boolean;
  onChargeOrder: (orderId: string) => void;
}

export function RestaurantOrdersModal({ open, onClose, orders, loading, onChargeOrder }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="🍽️ طلبات المطعم" size="lg">
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="text-center text-sm text-[var(--text-muted)] py-4">جاري التحميل...</div>
        ) : orders.length === 0 ? (
          <div className="text-center text-sm text-[var(--text-muted)] py-4">لا توجد طلبات</div>
        ) : orders.map(order => (
          <div key={order.id} className="bg-[var(--bg-primary)] rounded-xl p-3 border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-bold text-sm">#{order.orderNo}</span>
                <span className="text-xs text-[var(--text-muted)] mr-2">
                  {order.orderType === 'DINE_IN' ? `طاولة ${order.tableNo || ''}` : order.orderType === 'ROOM_SERVICE' ? `غرفة ${order.roomNo || ''}` : 'محمول'}
                </span>
              </div>
              <span className="font-bold text-[var(--gold)]">{order.totalAmount.toFixed(2)} د.ل</span>
            </div>
            {order.items.map((item, i) => (
              <div key={i} className="text-xs text-[var(--text-secondary)] flex justify-between">
                <span>{item.menuItem.nameAr || item.menuItem.name} x{item.quantity}</span>
                <span>{item.price.toFixed(2)} د.ل</span>
              </div>
            ))}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
              <span className={`text-xs ${order.status === 'COMPLETED' ? 'text-[var(--green)]' : 'text-[var(--gold)]'}`}>
                {order.status === 'PENDING' ? '⏳ معلق' : order.status === 'PREPARING' ? '👨‍🍳 تحضير' : order.status === 'READY' ? '✅ جاهز' : order.status === 'SERVED' ? '🍽️ مقدم' : order.status === 'COMPLETED' ? '✔️ مكتمل' : '❌ ملغي'}
              </span>
              {['PENDING', 'PREPARING', 'READY', 'SERVED'].includes(order.status) && (
                <Button size="sm" variant="secondary" onClick={() => onChargeOrder(order.id)}>
                  💰 شحن للفاتورة
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
