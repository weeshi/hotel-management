'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Badge, Modal, Input, Select, EmptyState } from '@/components/ui';

interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  booking?: { bookingNo: string; guestName?: string };
}

const paymentStatusConfig: Record<string, { label: string; variant: 'gold' | 'green' | 'red' | 'blue' | 'yellow' }> = {
  PENDING: { label: 'قيد الانتظار', variant: 'yellow' },
  SUCCEEDED: { label: 'تم بنجاح', variant: 'green' },
  FAILED: { label: 'فشل', variant: 'red' },
  REFUNDED: { label: 'مسترجع', variant: 'gold' },
  PARTIALLY_REFUNDED: { label: 'مسترجع جزئياً', variant: 'blue' },
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPayments() {
      try {
        const res = await fetch('/api/admin/bookings', {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        });
        const data = await res.json();
        if (data.success) setPayments([]);
      } finally {
        setLoading(false);
      }
    }
    fetchPayments();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">💳 المدفوعات</h1>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <EmptyState icon="💳" title="المدفوعات" description="سيتم عرض المدفوعات هنا قريباً" />
      )}
    </div>
  );
}
