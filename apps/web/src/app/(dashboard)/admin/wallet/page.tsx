'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input, Select, Button } from '@/components/ui';
import { WalletSummaryCards } from '@/components/wallet/WalletSummaryCards';
import { WalletTransactionTable } from '@/components/wallet/WalletTransactionTable';
import { WalletReceiptModal } from '@/components/wallet/WalletReceiptModal';

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

interface Summary {
  totalWallets: number;
  totalBalance: number;
  todayTopUp: number;
  todayWithdrawal: number;
}

export default function AdminWalletPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalWallets: 0, totalBalance: 0, todayTopUp: 0, todayWithdrawal: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [receiptTxId, setReceiptTxId] = useState<string | null>(null);
  const [receiptGuestName, setReceiptGuestName] = useState('');

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (type) params.set('type', type);
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/admin/wallet/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setSummary(data.data.summary);
        setTotalPages(data.data.pagination?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, type, search, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [type, search, dateFrom, dateTo]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  async function handleExportCSV() {
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams({ export: 'csv', limit: '10000' });
    if (type) params.set('type', type);
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const res = await fetch(`/api/admin/wallet/transactions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) return;

    const rows = [
      ['التاريخ', 'الوقت', 'النزيل', 'الهاتف', 'النوع', 'طريقة الدفع', 'المبلغ', 'البيان', 'أصدرها'],
    ];
    for (const tx of data.data.transactions) {
      rows.push([
        new Date(tx.createdAt).toLocaleDateString('ar-LY'),
        new Date(tx.createdAt).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' }),
        tx.guestName,
        tx.guestPhone || '',
        tx.type === 'TOP_UP' ? 'إيداع' : 'سحب',
        tx.method || '',
        String(tx.amount),
        tx.description || '',
        tx.createdByName || '',
      ]);
    }

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openReceipt(txId: string) {
    const tx = transactions.find(t => t.id === txId);
    setReceiptTxId(txId);
    setReceiptGuestName(tx?.guestName || '');
  }

  return (
    <div data-component="AdminWalletPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 إدارة المحافظ</h1>
        <Button variant="secondary" onClick={handleExportCSV}>
          📥 تصدير CSV
        </Button>
      </div>

      <WalletSummaryCards summary={summary} />

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="🔍 بحث باسم النزيل"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="اسم النزيل..."
          />
        </div>
        <Select
          label="نوع العملية"
          value={type}
          onChange={e => setType(e.target.value)}
          options={[
            { value: '', label: 'الكل' },
            { value: 'TOP_UP', label: 'إيداع' },
            { value: 'WITHDRAWAL', label: 'سحب' },
          ]}
        />
        <Input
          label="من تاريخ"
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
        <Input
          label="إلى تاريخ"
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <WalletTransactionTable transactions={transactions} onViewReceipt={openReceipt} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-sm text-[var(--text-muted)]">صفحة {page} من {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      <WalletReceiptModal
        open={!!receiptTxId}
        onClose={() => setReceiptTxId(null)}
        transactionId={receiptTxId}
        guestName={receiptGuestName}
      />
    </div>
  );
}
