'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, EmptyState } from '@/components/ui';
import { InvoiceModal } from '@/components/folio/invoice';
import { apiGet, apiPost } from '@/lib/utils/api-client';
import { FolioSearch } from '@/components/folio/FolioSearch';
import { FolioSummaryCard } from '@/components/folio/FolioSummaryCard';
import { FolioDetails } from '@/components/folio/FolioDetails';
import { AddChargeModal } from '@/components/folio/AddChargeModal';
import { AddServiceModal } from '@/components/folio/AddServiceModal';
import { RestaurantOrdersModal } from '@/components/folio/RestaurantOrdersModal';
import { DiscountModal } from '@/components/folio/DiscountModal';
import { PaymentModal } from '@/components/folio/PaymentModal';
import { VoidTransactionModal } from '@/components/folio/VoidTransactionModal';
import type { FolioSummary, RestaurantOrder, Service } from '@/components/folio/types';

export default function FolioPage() {
  const searchParams = useSearchParams();
  const initialBookingId = searchParams.get('bookingId');

  const [bookingId, setBookingId] = useState(initialBookingId || '');
  const [folio, setFolio] = useState<FolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [liveBookingId, setLiveBookingId] = useState(initialBookingId || '');

  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showRestaurantOrders, setShowRestaurantOrders] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [voidTarget, setVoidTarget] = useState<{ id: string; description: string; amount: number } | null>(null);

  const [restaurantOrders, setRestaurantOrders] = useState<RestaurantOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);

  async function fetchFolio() {
    if (!bookingId) return;
    setLoading(true);
    setError('');
    setLiveBookingId(bookingId);
    try {
      const res = await apiGet(`/api/admin/bookings/${bookingId}`);
      if (res.success && res.data.folio) {
        const folioRes = await apiGet(`/api/folio/${res.data.folio.id}`);
        if (folioRes.success) setFolio(folioRes.data);
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

  async function fetchRestaurantOrders() {
    if (!liveBookingId) return;
    setOrdersLoading(true);
    try {
      const res = await apiGet(`/api/admin/restaurant-orders?bookingId=${liveBookingId}`);
      if (res.success) setRestaurantOrders(res.data);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function fetchServices() {
    try {
      const res = await apiGet('/api/admin/services');
      if (res.success) setServices(res.data);
    } catch {}
  }

  useEffect(() => {
    if (initialBookingId) { setBookingId(initialBookingId); fetchFolio(); }
  }, [initialBookingId]);

  useEffect(() => {
    if (liveBookingId) fetchRestaurantOrders();
  }, [liveBookingId]);

  async function addCharge(description: string, amount: number) {
    if (!folio) return;
    try {
      const res = await apiPost(`/api/folio/${folio.folioId}/charge`, { description, amount, category: 'SERVICE' });
      if (res.success) { setShowAddCharge(false); fetchFolio(); fetchRestaurantOrders(); }
    } catch {}
  }

  async function addServiceToFolio(serviceId: string, quantity: number) {
    if (!folio) return;
    const res = await apiPost(`/api/admin/bookings/${liveBookingId}/charge-service`, { serviceId, quantity });
    if (res.success) { setShowAddService(false); fetchFolio(); }
  }

  async function collectPayment(amount: number, method: string) {
    if (!folio) throw new Error('لا توجد فاتورة');
    const res = await apiPost('/api/payments/create', { bookingId: liveBookingId, amount, method, currency: 'LYD' });
    if (res.success) {
      if (method === 'CASH' || method === 'CARD' || method === 'WALLET') fetchFolio();
      return res.data;
    }
    throw new Error(res.error?.message || 'فشل إنشاء الدفع');
  }

  async function applyDiscount(type: 'PERCENTAGE' | 'FIXED', value: number, reason: string) {
    if (!folio) return;
    try {
      const res = await apiPost(`/api/folio/${folio.folioId}/discount`, { type, value, reason });
      if (res.success) { setShowDiscount(false); fetchFolio(); }
    } catch {}
  }

  async function downloadPdf() {
    if (!folio) return;
    setPdfLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/folio/${folio.folioId}/invoice-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'فشل التحميل'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `فاتورة-${folio.folioId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  async function voidTransaction(transactionId: string, reason: string) {
    if (!folio) return;
    try {
      const res = await apiPost(`/api/folio/${folio.folioId}/transactions/${transactionId}/void`, { reason });
      if (res.success) { setVoidTarget(null); fetchFolio(); }
    } catch {}
  }

  async function chargeOrderToFolio(orderId: string) {
    if (!folio) return;
    try {
      const res = await apiPost(`/api/admin/restaurant-orders/${orderId}`);
      if (res.success) { fetchFolio(); fetchRestaurantOrders(); }
    } catch {}
  }

  const hasUnchargedOrders = restaurantOrders.some(o => ['PENDING', 'PREPARING', 'READY', 'SERVED'].includes(o.status));

  return (
    <div data-component="FolioPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 الفواتير (Folio Billing)</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <FolioSearch onSearch={(id) => { setBookingId(id); fetchFolio(); }} />
        <FolioSummaryCard folio={folio} />
      </div>

      {error && <div className="bg-[rgba(231,76,60,0.1)] text-[var(--red)] text-sm p-3 rounded-lg mb-6">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : folio ? (
        <FolioDetails
          folio={folio}
          restaurantOrders={restaurantOrders}
          hasUnchargedOrders={hasUnchargedOrders}
          onAddCharge={() => setShowAddCharge(true)}
          onAddService={() => { setShowAddService(true); fetchServices(); }}
          onDiscount={() => setShowDiscount(true)}
          onInvoice={() => setShowInvoice(true)}
          onPayment={() => setShowPayment(true)}
          onShowRestaurantOrders={() => setShowRestaurantOrders(true)}
          onDownloadPdf={downloadPdf}
          onVoidTransaction={(id, description, amount) => setVoidTarget({ id, description, amount })}
        />
      ) : !initialBookingId ? (
        <EmptyState icon="💰" title="ابحث عن فاتورة" description="أدخل رقم الحجز للبحث عن الفاتورة" />
      ) : null}

      <AddChargeModal open={showAddCharge} onClose={() => setShowAddCharge(false)} onAdd={addCharge} />
      <AddServiceModal open={showAddService} onClose={() => setShowAddService(false)} services={services} onAdd={addServiceToFolio} />
      <RestaurantOrdersModal open={showRestaurantOrders} onClose={() => setShowRestaurantOrders(false)} orders={restaurantOrders} loading={ordersLoading} onChargeOrder={chargeOrderToFolio} />
      <DiscountModal open={showDiscount} onClose={() => setShowDiscount(false)} onApply={applyDiscount} />

      {showInvoice && folio && <InvoiceModal folio={folio} onClose={() => setShowInvoice(false)} />}

      {folio && (
        <PaymentModal open={showPayment} onClose={() => setShowPayment(false)} balance={folio.balance} onCollect={collectPayment} />
      )}

      <VoidTransactionModal open={!!voidTarget} transaction={voidTarget} onClose={() => setVoidTarget(null)} onVoid={voidTransaction} />
    </div>
  );
}
