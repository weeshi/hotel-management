'use client';

import { Button } from '@/components/ui';
import { useState } from 'react';

interface BankTransferViewProps {
  amount: number;
  currency: string;
  onBack: () => void;
}

const bankInfo = {
  bankName: 'المصرف الإسلامي الليبي',
  iban: 'LY38 0250 0100 1234 5678 9012 3456',
  accountName: 'شركة إدارة الفنادق المتحدة',
  swift: 'LIIBLYLT',
  referencePrefix: 'HTL',
};

export function BankTransferView({ amount, currency, onBack }: BankTransferViewProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatAmount = (amt: number) =>
    amt.toLocaleString('ar-LY', { minimumFractionDigits: 3 });

  const [reference] = useState(() => `${bankInfo.referencePrefix}-${Date.now().toString(36).toUpperCase()}`);

  return (
    <div className="space-y-6" role="region" aria-label="تعليمات التحويل البنكي">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <svg className="h-6 w-6 text-[var(--gold)]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
          بيانات التحويل البنكي
        </h2>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">اسم البنك</p>
            <p className="font-bold text-[var(--text-primary)]">{bankInfo.bankName}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">اسم الحساب</p>
            <p className="font-bold text-[var(--text-primary)]">{bankInfo.accountName}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">IBAN</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-[var(--bg)] p-2 rounded border border-[var(--border)] break-all" dir="ltr">
                {bankInfo.iban}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(bankInfo.iban, 'iban')}
              >
                {copied === 'iban' ? (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    تم النسخ
                  </>
                ) : (
                  'نسخ'
                )}
              </Button>
            </div>
          </div>
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">SWIFT/BIC</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm bg-[var(--bg)] p-2 rounded border border-[var(--border)]" dir="ltr">
                {bankInfo.swift}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(bankInfo.swift, 'swift')}
              >
                {copied === 'swift' ? 'تم النسخ' : 'نسخ'}
              </Button>
            </div>
          </div>
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">مرجع الدفع (مطلوب)</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm bg-[var(--bg)] p-2 rounded border border-[var(--border)]" dir="ltr">
                {reference}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(reference, 'ref')}
              >
                {copied === 'ref' ? 'تم النسخ' : 'نسخ'}
              </Button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              استخدم هذا المرجع بالضبط في عملية التحويل لضمان مطابقة الدفع تلقائياً
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h3 className="font-bold text-[var(--text-primary)] mb-3">المبلغ المطلوب</h3>
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-secondary)]">المبلغ الإجمالي</span>
          <span className="text-2xl font-bold text-[var(--gold)]">
            {formatAmount(amount)} {currency}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--red)]/20 bg-[rgba(231,76,60,0.05)] p-4">
        <h4 className="font-bold text-[var(--red)] mb-2 flex items-center gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          تنبيه مهم
        </h4>
        <ul className="text-sm text-[var(--text-secondary)] space-y-1">
          <li>• يجب أن يتطابق المبلغ المحول تماماً مع المبلغ أعلاه</li>
          <li>• يجب كتابة مرجع الدفع ({reference}) في وصف التحويل</li>
          <li>• قد يستغرق ظهور التحويل 1-2 يوم عمل</li>
          <li>• احتفظ بإيصال التحويل للمراجعة</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          رجوع لاختيار الطريقة
        </Button>
        <Button onClick={() => window.print()} className="flex-1">
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          طباعة التعليمات
        </Button>
      </div>
    </div>
  );
}