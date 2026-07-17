'use client';

import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import type { Booking, FolioData } from './types';

interface Props {
  open: boolean;
  booking: Booking | null;
  folioData: FolioData | null;
  onConfirm: (bookingId: string, payment?: { method: string; amount: number }, action?: string) => void;
  onClose: () => void;
  onFetchWallet: (guestId: string) => Promise<number | null>;
}

export function CheckoutModal({ open, booking, folioData, onConfirm, onClose, onFetchWallet }: Props) {
  const { user } = useAuth();
  const [doPayment, setDoPayment] = useState(false);
  const [doMigrate, setDoMigrate] = useState(false);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  if (!booking) return null;
  const b = booking;

  async function handleMethodChange(method: string) {
    setPayMethod(method);
    if (method === 'WALLET' && b.guest?.id) {
      const balance = await onFetchWallet(b.guest.id);
      setWalletBalance(balance);
    }
  }

  function handleConfirm() {
    const payment = doPayment && payAmount && parseFloat(payAmount) > 0
      ? { method: payMethod, amount: parseFloat(payAmount) }
      : undefined;
    const action = doMigrate ? 'MIGRATE' : undefined;
    onConfirm(b.id, payment, action);
  }

  return (
    <Modal open={open} onClose={onClose} title="🧾 تسجيل الخروج" size="lg">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{b.bookingNo}</div>
          <div><strong>النزيل:</strong> {b.guestName || b.guest?.name || 'غير محدد'}</div>
        </div>

        {folioData && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-sm">
            <h3 className="font-bold text-[var(--gold)] mb-2">📋 ملخص الفاتورة</h3>
            <div className="space-y-1">
              {folioData.transactions.map((tx: any) => (
                <div key={tx.id} className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">{tx.description}</span>
                  <span className={Number(tx.amount) >= 0 ? 'text-[var(--text-primary)]' : 'text-[var(--green)]'}>
                    {Number(tx.amount) >= 0 ? '+ ' : ''}{Math.abs(Number(tx.amount)).toFixed(2)} د.ل
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-[var(--border)] font-bold">
                <span>الإجمالي</span>
                <span className="text-[var(--gold)]">{folioData.totalCharges.toFixed(2)} د.ل</span>
              </div>
              <div className="flex justify-between text-xs text-[var(--green)]">
                <span>✅ مدفوع</span>
                <span>{folioData.totalPaid.toFixed(2)} د.ل</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-[var(--gold)] font-bold">
                <span>⏳ الرصيد المستحق</span>
                <span className={folioData.balance > 0 ? 'text-[var(--gold)]' : 'text-[var(--green)]'}>{folioData.balance.toFixed(2)} د.ل</span>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-[var(--border)] pt-4">
          <label className="flex items-center gap-2 text-sm mb-2">
            <input type="checkbox" checked={doPayment} onChange={(e) => setDoPayment(e.target.checked)} className="accent-[var(--gold)]" />
            <span>💰 تحصيل دفعة عند الخروج</span>
          </label>

          {doPayment && (
            <div className="space-y-3 mr-6">
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">طريقة الدفع</label>
                <select value={payMethod} onChange={(e) => handleMethodChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--gold)]">
                  <option value="CASH">💰 نقداً</option>
                  <option value="CARD">💳 بطاقة</option>
                  <option value="STRIPE">🌐 Stripe</option>
                  <option value="MOBICASH">📱 موبي كاش</option>
                  {b.guest?.id && <option value="WALLET">👛 محفظة إلكترونية</option>}
                </select>
              </div>
              {payMethod === 'WALLET' && walletBalance !== null && (
                <div className="text-xs text-[var(--text-secondary)]">رصيد المحفظة: <span className="font-bold text-[var(--gold)]">{walletBalance.toFixed(2)} د.ل</span></div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">المبلغ (د.ل)</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={folioData ? `الرصيد: ${folioData.balance.toFixed(2)}` : '0.00'}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--gold)]" />
              </div>
            </div>
          )}
        </div>

        {folioData && folioData.balance > 0 && user && ['ADMIN', 'MANAGER'].includes(user.role) && (
          <div className="border-t border-[var(--border)] pt-4">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={doMigrate} onChange={(e) => setDoMigrate(e.target.checked)} className="accent-[var(--gold)]" />
              <span>👛 ترحيل الرصيد إلى المحفظة</span>
            </label>
            {doMigrate && (
              <div className="text-xs text-[var(--text-secondary)] mr-6">
                سيتم إضافة <strong className="text-[var(--gold)]">{folioData.balance.toFixed(2)} د.ل</strong> إلى محفظة النزيل
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleConfirm}>🧾 تأكيد الخروج{doPayment ? ' والدفع' : doMigrate ? ' والترحيل' : ''}</Button>
        </div>
      </div>
    </Modal>
  );
}
