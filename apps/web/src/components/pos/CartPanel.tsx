'use client';

import { Input, Button } from '@/components/ui';
import type { CartItem, Booking } from './types';

interface Props {
  cart: CartItem[];
  orderType: string;
  tableNo: string;
  roomNo: string;
  guestName: string;
  selectedBooking: Booking | null;
  submitting: boolean;
  onOrderTypeChange: (type: 'DINE_IN' | 'ROOM_SERVICE' | 'TAKEAWAY') => void;
  onTableNoChange: (val: string) => void;
  onRoomNoChange: (val: string) => void;
  onGuestNameChange: (val: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
  onPlaceOrder: () => void;
  onLinkFolio: () => void;
}

export function CartPanel({
  cart, orderType, tableNo, roomNo, guestName, selectedBooking, submitting,
  onOrderTypeChange, onTableNoChange, onRoomNoChange, onGuestNameChange,
  onUpdateQty, onPlaceOrder, onLinkFolio,
}: Props) {
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="w-80 flex flex-col bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden shrink-0">
      <div className="p-3 border-b border-[var(--border)]">
        <h2 className="font-bold text-sm">🛒 الطلب</h2>
      </div>

      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex gap-1 mb-2">
          {(['DINE_IN', 'ROOM_SERVICE', 'TAKEAWAY'] as const).map(t => (
            <button key={t} onClick={() => onOrderTypeChange(t)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${orderType === t ? 'bg-[var(--gold)] text-black' : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'}`}>
              {t === 'DINE_IN' ? 'داخلي' : t === 'ROOM_SERVICE' ? 'غرفة' : 'محمول'}
            </button>
          ))}
        </div>
        {orderType === 'DINE_IN' && (
          <Input label="رقم الطاولة" value={tableNo} onChange={(e) => onTableNoChange(e.target.value)} placeholder="مثال: T5" />
        )}
        {orderType === 'ROOM_SERVICE' && (
          <Input label="رقم الغرفة" value={roomNo} onChange={(e) => onRoomNoChange(e.target.value)} placeholder="مثال: 201" />
        )}
        <Input label="اسم النزيل" value={guestName} onChange={(e) => onGuestNameChange(e.target.value)} placeholder="اختياري" />
      </div>

      <div className="p-3 border-b border-[var(--border)]">
        <button onClick={onLinkFolio}
          className="w-full text-xs text-[var(--blue)] hover:underline text-right">
          {selectedBooking ? `📋 ${selectedBooking.guestName} (${selectedBooking.bookingNo})` : '+ ربط بالفاتورة'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] text-center py-4">الرجاء اختيار عناصر من القائمة</div>
        ) : cart.map(item => (
          <div key={item.id} className="flex items-center justify-between bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="flex-1 min-w-0 ml-2">
              <div className="text-xs font-semibold truncate">{item.nameAr || item.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{(item.price * item.quantity).toFixed(2)} د.ل</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onUpdateQty(item.id, item.quantity - 1)} className="w-6 h-6 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-xs flex items-center justify-center hover:border-[var(--gold)]">-</button>
              <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
              <button onClick={() => onUpdateQty(item.id, item.quantity + 1)} className="w-6 h-6 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-xs flex items-center justify-center hover:border-[var(--gold)]">+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-[var(--border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">الإجمالي</span>
          <span className="text-lg font-bold text-[var(--gold)]">{subtotal.toFixed(2)} د.ل</span>
        </div>
        <Button onClick={onPlaceOrder} disabled={cart.length === 0 || submitting} className="w-full">
          {submitting ? 'جاري...' : '🍽️ تأكيد الطلب'}
        </Button>
      </div>
    </div>
  );
}
