'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Input, Modal, Badge, EmptyState } from '@/components/ui';

interface FolioSummary {
  folioId: string;
  status: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
  guest: { name: string; email?: string };
  rooms: { number: string; checkIn: string; checkOut: string; nightlyRate: number }[];
  transactions: any[];
  discounts: any[];
  payments: any[];
}

export default function FolioPage() {
  const searchParams = useSearchParams();
  const initialBookingId = searchParams.get('bookingId');

  const [bookingId, setBookingId] = useState(initialBookingId || '');
  const [searchInput, setSearchInput] = useState('');
  const [folio, setFolio] = useState<FolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);

  async function fetchFolio() {
    if (!bookingId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success && data.data.folio) {
        const folioRes = await fetch(`/api/folio/${data.data.folio.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        });
        const folioData = await folioRes.json();
        if (folioData.success) setFolio(folioData.data);
        else setError('لا توجد فاتورة لهذا الحجز');
      } else {
        setError('لا توجد فاتورة لهذا الحجز');
      }
    } catch {
      setError('فشل الاتصال');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialBookingId) fetchFolio();
  }, [initialBookingId]);

  async function addCharge(description: string, amount: number) {
    if (!folio) return;
    try {
      const res = await fetch(`/api/folio/${folio.folioId}/charge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description, amount, category: 'SERVICE' }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddCharge(false);
        fetchFolio();
      }
    } catch {}
  }

  async function applyDiscount(type: string, value: number, reason: string) {
    if (!folio) return;
    try {
      const res = await fetch(`/api/folio/${folio.folioId}/discount`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, value, reason }),
      });
      const data = await res.json();
      if (data.success) {
        setShowDiscount(false);
        fetchFolio();
      }
    } catch {}
  }

  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 الفواتير (Folio Billing)</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card title="🔍 بحث عن فاتورة">
          <div className="space-y-3">
            <Input
              placeholder="رقم الحجز"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setBookingId(searchInput); fetchFolio(); } }}
            />
            <Button className="w-full" onClick={() => { setBookingId(searchInput); fetchFolio(); }}>بحث</Button>
          </div>
        </Card>

        <Card title="📊 ملخص">
          <div className="space-y-3">
            {[
              { label: 'فواتير نشطة', value: '—', color: 'var(--gold)' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center p-3 rounded-lg bg-[var(--bg-primary)]">
                <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                <span className="font-bold" style={{ color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {error && (
        <div className="bg-[rgba(231,76,60,0.1)] text-[var(--red)] text-sm p-3 rounded-lg mb-6">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : folio ? (
        <div>
          <div className="bg-gradient-to-br from-[#0F0F18] to-[#161620] border border-[var(--border-gold)] rounded-xl p-6 max-w-2xl mx-auto mb-6">
            <div className="flex items-center justify-between border-b border-dashed border-[var(--border)] pb-3 mb-4">
              <h2 className="text-[var(--gold)] font-bold text-lg">
                FOLIO
              </h2>
              <Badge variant={folio.status === 'ACTIVE' ? 'green' : 'gold'}>
                {folio.status === 'ACTIVE' ? 'نشط' : 'مسدد'}
              </Badge>
            </div>

            <div className="text-sm mb-4">
              <div>الضيف: <strong>{folio.guest.name}</strong></div>
              {folio.guest.email && <div>البريد: <strong>{folio.guest.email}</strong></div>}
              {folio.rooms.length > 0 && (
                <div className="mt-2 space-y-1">
                  {folio.rooms.map((room, i) => (
                    <div key={i} className="text-xs text-[var(--text-muted)]">
                      الغرفة {room.number}: {new Date(room.checkIn).toLocaleDateString('ar-LY')} ← {new Date(room.checkOut).toLocaleDateString('ar-LY')} ({room.nightlyRate} د.ل/ليلة)
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {folio.transactions.map((tx: any) => (
                <div key={tx.id} className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{tx.description}</span>
                  <span className={`font-semibold ${tx.amount >= 0 ? 'text-[var(--text-primary)]' : 'text-[var(--green)]'}`}>
                    {tx.amount >= 0 ? '' : '-'}{Math.abs(tx.amount).toFixed(2)} د.ل
                  </span>
                </div>
              ))}

              <div className="flex justify-between pt-2 border-t border-[var(--border)] font-bold">
                <span>الإجمالي</span>
                <span className="text-[var(--gold)]">{folio.totalCharges.toFixed(2)} د.ل</span>
              </div>

              <div className="flex justify-between text-xs text-[var(--green)]">
                <span>✅ مدفوع</span>
                <span>{folio.totalPaid.toFixed(2)} د.ل</span>
              </div>

              <div className="flex justify-between pt-2 border-t-2 border-[var(--gold)] font-bold text-lg">
                <span>⏳ الرصيد</span>
                <span className={folio.balance > 0 ? 'text-[var(--gold)]' : 'text-[var(--green)]'}>
                  {folio.balance.toFixed(2)} د.ل
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setShowAddCharge(true)}>
                ➕ إضافة رسوم
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setShowDiscount(true)}>
                🏷️ خصم
              </Button>
              <Button size="sm" className="flex-1">
                💳 دفع
              </Button>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-[var(--text-muted)]">
              💡 نظام Folio Billing — قلب الفوترة الفندقية. متكامل مع Stripe وموبي كاش.
            </p>
          </div>
        </div>
      ) : !initialBookingId ? (
        <EmptyState icon="💰" title="ابحث عن فاتورة" description="أدخل رقم الحجز للبحث عن الفاتورة" />
      ) : null}

      <Modal open={showAddCharge} onClose={() => setShowAddCharge(false)} title="إضافة رسوم">
        <div className="space-y-4">
          <Input label="الوصف" value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} />
          <Input label="المبلغ (د.ل)" type="number" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowAddCharge(false)}>إلغاء</Button>
            <Button onClick={() => addCharge(chargeDesc, parseFloat(chargeAmount))}>إضافة</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showDiscount} onClose={() => setShowDiscount(false)} title="تطبيق خصم">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">نوع الخصم</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED')}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
            >
              <option value="PERCENTAGE">نسبة مئوية (%)</option>
              <option value="FIXED">قيمة ثابتة (د.ل)</option>
            </select>
          </div>
          <Input label={discountType === 'PERCENTAGE' ? 'النسبة (%)' : 'المبلغ (د.ل)'} type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          <Input label="السبب" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowDiscount(false)}>إلغاء</Button>
            <Button onClick={() => applyDiscount(discountType, parseFloat(discountValue), discountReason)}>تطبيق</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
