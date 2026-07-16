'use client';

import { Badge } from '@/components/ui';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  method?: string;
  description?: string;
  createdByName: string;
  createdAt: string;
  guestName: string;
  guestPhone?: string;
}

interface Props {
  transactions: Transaction[];
  onViewReceipt: (id: string) => void;
}

const methodLabels: Record<string, string> = {
  CASH: '💰 نقداً',
  TRANSFER: '🏦 حوالة',
  CARD: '💳 بطاقة',
  CHEQUE: '📝 شيك',
};

export function WalletTransactionTable({ transactions, onViewReceipt }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        لا توجد معاملات مطابقة
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg-card)] border-b border-[var(--border)]">
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">التاريخ والوقت</th>
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">النزيل</th>
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">النوع</th>
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">طريقة الدفع</th>
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">المبلغ</th>
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">البيان</th>
            <th className="px-4 py-3 text-right font-semibold text-[var(--text-secondary)]">أصدرها</th>
            <th className="px-4 py-3 text-center font-semibold text-[var(--text-secondary)]">الإيصال</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="text-xs text-[var(--text-secondary)]">
                  {new Date(tx.createdAt).toLocaleDateString('ar-LY')}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {new Date(tx.createdAt).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="text-sm font-medium">{tx.guestName}</div>
                {tx.guestPhone && (
                  <div className="text-[10px] text-[var(--text-muted)]">{tx.guestPhone}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant={tx.type === 'DEPOSIT' || tx.type === 'REFUND' ? 'green' : 'red'}>
                  {tx.type === 'DEPOSIT' ? 'إيداع' : tx.type === 'REFUND' ? 'استرداد' : tx.type === 'PAYMENT' ? 'دفع' : 'سحب'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                {methodLabels[tx.method || ''] || '—'}
              </td>
              <td className={`px-4 py-3 font-bold ${tx.type === 'DEPOSIT' || tx.type === 'REFUND' ? 'text-green-600' : 'text-red-600'}`}>
                {tx.type === 'DEPOSIT' || tx.type === 'REFUND' ? '+' : ''}{tx.amount.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-[200px] truncate">
                {tx.description || '—'}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                {tx.createdByName || '—'}
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => onViewReceipt(tx.id)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 hover:brightness-110 transition-all"
                >
                  📄 إيصال
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
