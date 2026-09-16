'use client';

import { memo } from 'react';
import type { Gateway } from '../context/PaymentSessionContext';

interface GatewaySelectorCardProps {
  gateway: {
    id: Gateway;
    label: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
  };
  onSelect: (gateway: Gateway) => void;
  loading: boolean;
  isElectronic: boolean;
}

export const GatewaySelectorCard = memo(function GatewaySelectorCard({
  gateway,
  onSelect,
  loading,
  isElectronic,
}: GatewaySelectorCardProps) {
  return (
    <button
      type="button"
      onClick={() => !loading && onSelect(gateway.id)}
      disabled={loading}
      className="group relative flex flex-col p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--gold)] hover:bg-[rgba(201,168,76,0.04)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--gold)] focus:ring-offset-2 focus:ring-offset-[var(--bg)]"
      role="listitem"
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl ${
            isElectronic
              ? 'bg-[rgba(201,168,76,0.1)] text-[var(--gold)]'
              : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
          }`}
          aria-hidden="true"
        >
          {gateway.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-[var(--text-primary)]">{gateway.label}</h3>
            {gateway.badge && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                {gateway.badge}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)] truncate">{gateway.description}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between">
        <span className="text-sm text-[var(--text-muted)]">
          {isElectronic ? 'توجيه فوري للبوابة' : 'تعليمات الدفع عند الوصول'}
        </span>
        <svg
          className="h-5 w-5 text-[var(--gold)] group-hover:translate-x-1 transition-transform"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </div>

      {gateway.badge === 'الأسرع' && (
        <span className="absolute -top-2 -right-2 text-xs px-2 py-0.5 rounded-full bg-[var(--gold)] text-white font-bold">
          {gateway.badge}
        </span>
      )}
    </button>
  );
});

GatewaySelectorCard.displayName = 'GatewaySelectorCard';