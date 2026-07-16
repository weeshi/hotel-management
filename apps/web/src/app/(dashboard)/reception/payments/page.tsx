'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Badge, Table, Select, EmptyState } from '@/components/ui';
import { RefundModal } from '@/components/folio/RefundModal';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface Refund {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  refundedAmount: number;
  createdAt: string;
  booking?: { bookingNo: string; guestName?: string } | null;
  refunds: Refund[];
}

const paymentStatusConfig: Record<string, { label: string; variant: 'gold' | 'green' | 'red' | 'blue' | 'yellow' | 'purple' }> = {
  PENDING: { label: 'قيد الانتظار', variant: 'yellow' },
  SUCCEEDED: { label: 'تم بنجاح', variant: 'green' },
  FAILED: { label: 'فشل', variant: 'red' },
  REFUNDED: { label: 'مسترجع', variant: 'gold' },
  PARTIALLY_REFUNDED: { label: 'مسترجع جزئياً', variant: 'purple' },
};

const paymentMethodLabels: Record<string, string> = {
  CASH: 'نقداً',
  CARD: 'بطاقة',
  STRIPE: 'Stripe',
  MOBICASH: 'MobiCash',
  IDFA3LY: 'إدفعلي',
  YASERPAY: 'ياسر باي',
  ONEPAY: 'OnePay',
  PAYPAL: 'PayPal',
  WALLET: '👛 المحفظة',
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [refundTarget, setRefundTarget] = useState<{ id: string; amount: number; refundedAmount: number; method: string } | null>(null);

  async function fetchPayments(status?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (status) params.set('status', status);

      const res = await fetch(`/api/admin/payments?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setPayments(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPayments(); }, []);

  useEffect(() => { fetchPayments(statusFilter); }, [statusFilter]);

  async function handleRefund(paymentId: string, amount: number, reason: string) {
    await getCsrfToken();
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ amount, reason }),
      });
      const data = await res.json();
      if (data.success) { setRefundTarget(null); fetchPayments(statusFilter); }
    } catch {}
  }

  const columns = [
    {
      key: 'booking',
      header: 'الحجز',
      render: (p: Payment) => (
        <div>
          <p className="font-medium">{p.booking?.bookingNo || '—'}</p>
          {p.booking?.guestName && <p className="text-xs text-[var(--text-secondary)]">{p.booking.guestName}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'المبلغ',
      render: (p: Payment) => (
        <span className="font-bold">{p.amount.toFixed(2)} د.ل</span>
      ),
    },
    {
      key: 'method',
      header: 'طريقة الدفع',
      render: (p: Payment) => paymentMethodLabels[p.method] || p.method,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (p: Payment) => {
        const cfg = paymentStatusConfig[p.status] || { label: p.status, variant: 'blue' as const };
        return (
          <div className="flex items-center gap-2">
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            {p.refundedAmount > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">مردود {p.refundedAmount} د.ل</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'التاريخ',
      render: (p: Payment) => (
        <span className="text-sm text-[var(--text-secondary)]">
          {new Date(p.createdAt).toLocaleDateString('ar-LY')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p: Payment) => (
        p.status === 'SUCCEEDED' && p.refundedAmount < p.amount ? (
          <Button size="sm" variant="ghost" onClick={() => setRefundTarget({ id: p.id, amount: p.amount, refundedAmount: p.refundedAmount, method: p.method })}>
            🔄 استرداد
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💳 المدفوعات</h1>
      </div>

      <Card>
        <div className="flex items-center gap-4 mb-4">
          <Select
            label="تصفية حسب الحالة"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'الكل' },
              { value: 'PENDING', label: 'قيد الانتظار' },
              { value: 'SUCCEEDED', label: 'تم بنجاح' },
              { value: 'FAILED', label: 'فشل' },
              { value: 'REFUNDED', label: 'مسترجع' },
              { value: 'PARTIALLY_REFUNDED', label: 'مسترجع جزئياً' },
            ]}
          />
          <div className="flex gap-2 mr-auto">
            {[{ label: 'الصافي', count: payments.reduce((s, p) => s + p.amount - p.refundedAmount, 0) }].map((s) => (
              <div key={s.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-2 text-center">
                <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
                <p className="text-lg font-bold text-[var(--gold)]">{s.count.toFixed(2)} د.ل</p>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : payments.length === 0 ? (
          <EmptyState icon="💳" title="لا توجد مدفوعات" description="لم يتم تسجيل أي مدفوعات بعد" />
        ) : (
          <Table columns={columns} data={payments} keyExtractor={(p) => p.id} />
        )}
      </Card>

      <RefundModal open={!!refundTarget} payment={refundTarget} onClose={() => setRefundTarget(null)} onRefund={handleRefund} />
    </div>
  );
}
