'use client';

interface Summary {
  totalWallets: number;
  totalBalance: number;
  todayTopUp: number;
  todayWithdrawal: number;
}

export function WalletSummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: 'المحافظ', value: summary.totalWallets, icon: '👛', color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'إجمالي الرصيد', value: `${summary.totalBalance.toFixed(2)} د.ل`, icon: '💰', color: 'text-[var(--gold)]', bg: 'bg-[var(--gold)]/10' },
    { label: 'إيداعات اليوم', value: `${summary.todayTopUp.toFixed(2)} د.ل`, icon: '📈', color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'سحوبات اليوم', value: `${summary.todayWithdrawal.toFixed(2)} د.ل`, icon: '📉', color: 'text-red-600', bg: 'bg-red-500/10' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg">{card.icon}</span>
          </div>
          <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
