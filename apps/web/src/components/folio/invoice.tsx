'use client';

import { Button } from '@/components/ui';

interface InvoiceProps {
  folio: any;
  onClose: () => void;
}

export function InvoiceModal({ folio, onClose }: InvoiceProps) {
  const hotelName = 'فندق السلام';
  const today = new Date().toLocaleDateString('ar-LY', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0">
      <div className="fixed inset-0 bg-black/60 print:hidden" onClick={onClose} />
      <div className="relative bg-white text-black rounded-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto print:rounded-none print:max-h-none print:shadow-none print:overflow-visible" dir="rtl">
        <style>{`
          @media print {
            body { background: white !important; }
            @page { margin: 1.5cm; size: A4; }
          }
        `}</style>

        <div className="border-b-2 border-gray-300 pb-4 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{hotelName}</h1>
            <p className="text-sm text-gray-500">فاتورة فندقية — Folio Invoice</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-400">التاريخ: {today}</p>
            <p className="text-xs text-gray-400">Folio: {folio.folioId?.slice(0, 8)}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="font-bold text-gray-900">{folio.guest?.name}</p>
          {folio.guest?.email && <p className="text-sm text-gray-500">{folio.guest.email}</p>}
          {folio.rooms?.map((room: any, i: number) => (
            <p key={i} className="text-sm text-gray-500">
              الغرفة {room.number} | {new Date(room.checkIn).toLocaleDateString('ar-LY')} ← {new Date(room.checkOut).toLocaleDateString('ar-LY')}
            </p>
          ))}
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-right py-2 text-gray-700 font-bold">البيان</th>
              <th className="text-left py-2 text-gray-700 font-bold">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {folio.transactions?.filter((tx: any) => tx.amount > 0).map((tx: any) => (
              <tr key={tx.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-800">{tx.description}</td>
                <td className="py-2 text-left font-semibold">{tx.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t-2 border-gray-300 pt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">إجمالي الرسوم</span>
            <span className="font-bold">{folio.totalCharges?.toFixed(2)} د.ل</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>المدفوع</span>
            <span className="font-bold">-{folio.totalPaid?.toFixed(2)} د.ل</span>
          </div>
          <div className="flex justify-between text-lg border-t border-gray-300 pt-2 mt-2">
            <span className="font-extrabold">الرصيد</span>
            <span className="font-extrabold">{folio.balance?.toFixed(2)} د.ل</span>
          </div>
        </div>

        {folio.payments?.filter((p: any) => p.status === 'SUCCEEDED').length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-2">سجل المدفوعات</p>
            {folio.payments.filter((p: any) => p.status === 'SUCCEEDED').map((p: any) => (
              <div key={p.id} className="flex justify-between text-xs text-gray-500 py-1">
                <span>{p.method} — {new Date(p.createdAt).toLocaleDateString('ar-LY')}</span>
                <span className="font-semibold">{p.amount.toFixed(2)} د.ل</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
          <p>{hotelName} — شكراً لاختياركم إقامتكم لدينا</p>
        </div>

        <div className="flex gap-3 justify-center mt-6 print:hidden">
          <Button variant="secondary" onClick={onClose}>إغلاق</Button>
          <Button onClick={() => window.print()}>🖨️ طباعة / PDF</Button>
        </div>
      </div>
    </div>
  );
}
