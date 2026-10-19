'use client';

import { memo } from 'react';
import { GatewaySelectorCard } from './GatewaySelectorCard';
import type { Gateway } from '../context/PaymentSessionContext';

interface GatewaySelectorProps {
  onSelect: (gateway: Gateway) => void;
  loading: boolean;
  balance: number;
  currency: string;
}

const gateways: { id: Gateway; label: string; description: string; icon: React.ReactNode; badge?: string }[] = [
  {
    id: 'plutu',
    label: 'Plutu',
    description: 'الدفع الإلكتروني عبر Plutu (بطاقات، محفظة)',
    icon: (
      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 2v.5H4V6h16v.5zM4 18V10h16v8H4z"/>
      </svg>
    ),
    badge: 'الأسرع',
  },
  {
    id: 'tlync',
    label: 'T-Lync',
    description: 'الدفع الإلكتروني عبر T-Lync (بطاقات، تحويل)',
    icon: (
      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm9 10a9 9 0 01-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  {
    id: 'bank-transfer',
    label: 'تحويل بنكي',
    description: 'دفع المبلغ عبر تحويل بنكي (IBAN)',
    icon: (
      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
      </svg>
    ),
    badge: 'عند الوصول',
  },
  {
    id: 'cash',
    label: 'دفع نقدي',
    description: 'دفع المبلغ نقداً عند الوصول للفندق',
    icon: (
      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
    badge: 'عند الوصول',
  },
];

export const GatewaySelector = memo(function GatewaySelector({
  onSelect,
  loading,
  balance,
  currency,
}: GatewaySelectorProps) {
  return (
    <div className="space-y-4" data-component="GatewaySelector">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2" id="checkout-balance-heading">
          المبلغ المستحق
        </h3>
        <p
          className="text-2xl font-bold text-[var(--gold)]"
          aria-labelledby="checkout-balance-heading"
          aria-live="polite"
        >
          {balance.toLocaleString('ar-LY', { minimumFractionDigits: 3 })} {currency}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list" aria-label="اختر طريقة الدفع">
        {gateways.map((gateway) => (
          <div key={gateway.id} role="listitem">
            <GatewaySelectorCard
              gateway={gateway}
              onSelect={onSelect}
              loading={loading}
              isElectronic={gateway.id === 'plutu' || gateway.id === 'tlync'}
            />
          </div>
        ))}
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="alert" aria-live="assertive">
          <div className="bg-white rounded-xl p-6 text-center">
            <div className="animate-spin h-10 w-10 border-4 border-[var(--gold)] border-t-transparent rounded-full mx-auto mb-3" role="presentation" />
            <p className="text-[var(--text-primary)]">جاري إنشاء جلسة الدفع...</p>
          </div>
        </div>
      )}
    </div>
  );
});

GatewaySelector.displayName = 'GatewaySelector';