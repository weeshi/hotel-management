'use client';

import { useEffect, useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { showErrorModal } from '@/components/ui/error-modal';

interface Props {
  open: boolean;
  onClose: () => void;
  balance: number;
  onCollect: (amount: number, method: string) => Promise<void>;
}

export function PaymentModal({ open, onClose, balance, onCollect }: Props) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (balance <= 0 && open) onClose();
  }, [balance, open, onClose]);

  if (balance <= 0) return null;

  async function handleCollect() {
    if (!amount) return;
    setLoading(true);
    try {
      const res = await onCollect(parseFloat(amount), method);
      setResult(res);
    } catch (e: any) {
      showErrorModal(e.message || 'فشل الدفع');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setResult(null);
    onClose();
  }

  if (result) {
    return (
      <Modal open={open} onClose={handleClose} title="💳 تحصيل دفعة" size="lg">
        <div className="space-y-4">
          {result.status === 'SUCCEEDED' ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-lg font-bold text-[var(--green)]">تم استلام الدفعة بنجاح</p>
              <p className="text-sm text-[var(--text-secondary)] mt-2">رقم الدفعة: {result.paymentId}</p>
              <Button className="mt-6" onClick={handleClose}>تم</Button>
            </div>
          ) : result.redirectUrl ? (
            <div className="text-center py-6 space-y-4">
              <p className="text-lg font-bold">سيتم تحويلك إلى بوابة الدفع</p>
              <a href={result.redirectUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 rounded-xl bg-[var(--gold)] text-black font-bold">فتح بوابة الدفع</a>
            </div>
          ) : result.qrCode ? (
            <div className="text-center py-6 space-y-4">
              <p className="text-lg font-bold">امسح رمز QR للدفع</p>
              <img src={result.qrCode} alt="QR Code" className="mx-auto w-48 h-48" />
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <p className="text-lg font-bold">تم إنشاء طلب الدفع</p>
              <p className="text-sm text-[var(--text-secondary)]">رقم الدفعة: {result.paymentId}</p>
              <Button variant="secondary" onClick={handleClose}>إغلاق</Button>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="💳 تحصيل دفعة" size="lg">
      <div className="space-y-4">
        <Input label="المبلغ (د.ل)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">طريقة الدفع</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]">
            <option value="WALLET">👛 المحفظة</option>
            <option value="CASH">💰 نقداً</option>
            <option value="CARD">💳 بطاقة</option>
            <option value="MOBICASH">📱 موبي كاش</option>
            <option value="SADAD">📲 سداد</option>
            <option value="TADAWUL">📲 تدوال</option>
            <option value="BANK_TRANSFER">🏦 تحويل بنكي</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={handleClose}>إلغاء</Button>
          <Button onClick={handleCollect} loading={loading}>تأكيد الدفع</Button>
        </div>
      </div>
    </Modal>
  );
}
