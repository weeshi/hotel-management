'use client';

import { Modal, Button } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  transactionId: string | null;
  guestName: string;
}

export function WalletReceiptModal({ open, onClose, transactionId, guestName }: Props) {
  async function handleDownload() {
    if (!transactionId) return;
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/admin/wallet/transactions/${transactionId}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${transactionId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePrint() {
    if (!transactionId) return;
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/admin/wallet/transactions/${transactionId}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  return (
    <Modal open={open} onClose={onClose} title="📄 إيصال المعاملة">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          إيصال معاملة للنزيل <span className="font-semibold text-[var(--text-primary)]">{guestName}</span>
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={handleDownload}>
            ⬇️ تحميل PDF
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            🖨️ طباعة
          </Button>
        </div>
      </div>
    </Modal>
  );
}
