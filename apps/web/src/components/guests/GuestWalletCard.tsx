'use client';

import { Card, Badge } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';
import { useAuth } from '@/contexts/auth-context';

interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  description?: string | null;
  createdAt: string;
}

interface WalletDetail {
  id: string;
  balance: number;
  isFrozen?: boolean;
  transactions: WalletTransaction[];
}

interface Props {
  wallet?: WalletDetail | null;
  canManage: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
  onRefresh?: () => void;
}

const TX_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'إيداع',
  WITHDRAWAL: 'سحب',
  PAYMENT: 'دفع',
  REFUND: 'استرداد',
  ADJUSTMENT: 'تعديل',
};

const TX_TYPE_COLOR: Record<string, 'green' | 'red' | 'blue'> = {
  DEPOSIT: 'green',
  WITHDRAWAL: 'red',
  PAYMENT: 'red',
  REFUND: 'green',
  ADJUSTMENT: 'blue',
};

export function GuestWalletCard({ wallet, canManage, onDeposit, onWithdraw, onRefresh }: Props) {
  const txns = wallet?.transactions || [];
  const { user } = useAuth();
  const userRole = user?.role || '';

  const isFrozen = wallet?.isFrozen ?? false;
  const canFreeze = userRole === 'ADMIN' || userRole === 'MANAGER';

  async function handleToggleFreeze() {
    if (!wallet?.id || isFrozen === undefined) return;
    await apiPost(`/api/admin/wallet/${wallet.id}/freeze`, {}, {
      successMsg: isFrozen ? '✅ تم إلغاء تجميد المحفظة' : '✅ تم تجميد المحفظة',
      errorMsg: 'فشل تحديث حالة التجميد',
      onSuccess: () => onRefresh?.(),
    });
  }

  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">💰 المحفظة</h3>
          {isFrozen && (
            <Badge variant="red">🧊 مجمدة</Badge>
          )}
          {!isFrozen && wallet && (
            <Badge variant="green">✅ نشطة</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canFreeze && wallet?.id && (
            <button
              type="button"
              onClick={handleToggleFreeze}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                isFrozen
                  ? 'bg-green-500/10 text-green-600 border border-green-500/20 hover:brightness-110'
                  : 'bg-orange-500/10 text-orange-600 border border-orange-500/20 hover:brightness-110'
              }`}
            >
              {isFrozen ? '🔓 إلغاء التجميد' : '🧊 تجميد'}
            </button>
          )}
          {canManage && (
            <>
              <button onClick={onDeposit} className="px-3 py-1 rounded-lg text-xs font-bold bg-green-500/10 text-green-600 border border-green-500/20 hover:brightness-110 transition-all">
                + إيداع
              </button>
              <button onClick={onWithdraw} className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/10 text-red-600 border border-red-500/20 hover:brightness-110 transition-all">
                - سحب
              </button>
            </>
          )}
        </div>
      </div>

      {isFrozen && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 font-medium">
          🧸 هذه المحفظة مجمدة حالياً. لا يمكن إجراء عمليات السحب أو الدفع.
        </div>
      )}

      <div className="text-3xl font-bold text-[var(--gold)] mb-4">{wallet?.balance ?? 0} <span className="text-sm font-normal text-[var(--text-muted)]">د.ل</span></div>

      {txns.length === 0 ? (
        <div className="text-center py-4 text-[var(--text-muted)] text-sm">لا توجد حركات</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {txns.map((tx) => {
            const type = tx.type;
            const label = TX_TYPE_LABEL[type] || type;
            const color = TX_TYPE_COLOR[type] || 'blue';
            const isCredit = type === 'DEPOSIT' || type === 'REFUND';
            return (
              <div key={tx.id} className="flex items-center justify-between p-2.5 bg-[var(--bg-card)] rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant={color}>
                    {label}
                  </Badge>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)]">{tx.description || '—'}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{new Date(tx.createdAt).toLocaleString('ar-LY')}</div>
                  </div>
                </div>
                <span className={`font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                  {isCredit ? '+' : ''}{tx.amount}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
