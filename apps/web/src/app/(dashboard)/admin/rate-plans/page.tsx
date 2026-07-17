'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Modal, Badge, EmptyState, Table } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface RatePlan {
  id: string;
  name: string;
  nameAr?: string;
  nightlyRate: number;
  startDate: string;
  endDate: string;
  minStay: number;
  applyDays?: string;
  isActive: boolean;
  roomTypeId: string;
  roomType: { id: string; name: string; nameAr?: string };
  cancellationPolicyId?: string;
  cancellationPolicy?: { id: string; name: string; nameAr?: string };
  maxAdults: number;
  maxChildren: number;
  extraBedPrice: number | null;
}

export default function AdminRatePlansPage() {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<RatePlan | null>(null);
  const [form, setForm] = useState({ roomTypeId: '', name: '', nameAr: '', nightlyRate: '', startDate: '', endDate: '', minStay: '1', maxAdults: '2', maxChildren: '0', extraBedPrice: '', applyDays: '', cancellationPolicyId: '' });
  const [editForm, setEditForm] = useState({ roomTypeId: '', name: '', nameAr: '', nightlyRate: '', startDate: '', endDate: '', minStay: '1', maxAdults: '2', maxChildren: '0', extraBedPrice: '', applyDays: '', cancellationPolicyId: '' });

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const [plansRes, typesRes, polRes] = await Promise.all([
        fetch('/api/admin/rate-plans', { headers }),
        fetch('/api/admin/room-types', { headers }),
        fetch('/api/admin/cancellation-policies', { headers }),
      ]);
      const plansData = await plansRes.json();
      const typesData = await typesRes.json();
      const polData = await polRes.json();
      if (plansData.success) setPlans(plansData.data);
      if (typesData.success) setRoomTypes(typesData.data);
      if (polData.success) setPolicies(polData.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    await getCsrfToken();
    try {
      await fetch('/api/admin/rate-plans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ ...form, nightlyRate: parseFloat(form.nightlyRate), minStay: parseInt(form.minStay), maxAdults: parseInt(form.maxAdults), maxChildren: parseInt(form.maxChildren), extraBedPrice: form.extraBedPrice ? parseFloat(form.extraBedPrice) : undefined, cancellationPolicyId: form.cancellationPolicyId || undefined }),
      });
      setShowCreate(false);
      setForm({ roomTypeId: '', name: '', nameAr: '', nightlyRate: '', startDate: '', endDate: '', minStay: '1', maxAdults: '2', maxChildren: '0', extraBedPrice: '', applyDays: '', cancellationPolicyId: '' });
      fetchData();
    } catch {}
  }

  async function updatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!showEdit) return;
    await getCsrfToken();
    try {
      await fetch(`/api/admin/rate-plans/${showEdit.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ ...editForm, nightlyRate: parseFloat(editForm.nightlyRate), minStay: parseInt(editForm.minStay), maxAdults: parseInt(editForm.maxAdults), maxChildren: parseInt(editForm.maxChildren), extraBedPrice: editForm.extraBedPrice ? parseFloat(editForm.extraBedPrice) : null }),
      });
      setShowEdit(null);
      fetchData();
    } catch {}
  }

  async function deletePlan(plan: RatePlan) {
    if (!confirm(`حذف "${plan.name}"؟`)) return;
    await getCsrfToken();
    try {
      await fetch(`/api/admin/rate-plans/${plan.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, ...csrfHeaders() } });
      fetchData();
    } catch {}
  }

  const daysOptions = [
    { value: '', label: 'كل الأيام' },
    { value: 'mon,tue,wed,thu,fri', label: 'أيام العمل' },
    { value: 'sat,sun', label: 'نهاية الأسبوع' },
  ];

  const columns = [
    { key: 'name', header: 'الاسم', render: (p: RatePlan) => <span className="font-semibold">{p.nameAr || p.name}</span> },
    { key: 'roomType', header: 'نوع الغرفة', render: (p: RatePlan) => <span className="text-xs text-[var(--text-muted)]">{p.roomType?.nameAr || p.roomType?.name}</span> },
    { key: 'nightlyRate', header: 'السعر', render: (p: RatePlan) => <span className="font-bold text-[var(--gold)]">{p.nightlyRate} د.ل</span> },
    { key: 'dates', header: 'الفترة', render: (p: RatePlan) => <span className="text-xs">{new Date(p.startDate).toLocaleDateString('ar-LY')} — {new Date(p.endDate).toLocaleDateString('ar-LY')}</span> },
    { key: 'minStay', header: 'أقل إقامة', render: (p: RatePlan) => <span className="text-xs">{p.minStay} ليلة</span> },
    { key: 'maxAdults', header: 'البالغين', render: (p: RatePlan) => <span className="text-xs">{p.maxAdults}</span> },
    { key: 'maxChildren', header: 'الأطفال', render: (p: RatePlan) => <span className="text-xs">{p.maxChildren}</span> },
    { key: 'extraBedPrice', header: 'سرير إضافي', render: (p: RatePlan) => <span className="text-xs">{p.extraBedPrice ? `${p.extraBedPrice} د.ل` : '—'}</span> },
    {
      key: 'actions', header: 'إجراءات',
      render: (p: RatePlan) => (
        <div className="flex gap-2">
          <button onClick={() => { setEditForm({ roomTypeId: p.roomTypeId, name: p.name, nameAr: p.nameAr || '', nightlyRate: String(p.nightlyRate), startDate: p.startDate.slice(0, 10), endDate: p.endDate.slice(0, 10), minStay: String(p.minStay), maxAdults: String(p.maxAdults), maxChildren: String(p.maxChildren), extraBedPrice: p.extraBedPrice ? String(p.extraBedPrice) : '', applyDays: p.applyDays || '', cancellationPolicyId: p.cancellationPolicy?.id || '' }); setShowEdit(p); }} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
          <button onClick={() => deletePlan(p)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
        </div>
      ),
    },
  ];

  return (
    <div data-component="AdminRatePlansPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🏷️ خطط الأسعار</h1>
        <Button onClick={() => setShowCreate(true)}>+ خطة جديدة</Button>
      </div>

      <Table columns={columns} data={plans} keyExtractor={(p) => p.id} loading={loading} emptyMessage="لا توجد خطط أسعار بعد" />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إضافة خطة سعر" size="lg">
        <form onSubmit={createPlan} className="space-y-4">
          <Input label="الاسم (عربي)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="نوع الغرفة" value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })} options={roomTypes.map((rt) => ({ value: rt.id, label: rt.nameAr || rt.name }))} />
          <Input label="السعر لليلة (د.ل)" type="number" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="تاريخ البداية" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            <Input label="تاريخ النهاية" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          </div>
          <Input label="أقل عدد ليالٍ" type="number" value={form.minStay} onChange={(e) => setForm({ ...form, minStay: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="الحد الأقصى للبالغين" type="number" min={1} value={form.maxAdults} onChange={(e) => setForm({ ...form, maxAdults: e.target.value })} />
            <Input label="الحد الأقصى للأطفال" type="number" min={0} value={form.maxChildren} onChange={(e) => setForm({ ...form, maxChildren: e.target.value })} />
            <Input label="سعر السرير الإضافي (د.ل)" type="number" min={0} value={form.extraBedPrice} onChange={(e) => setForm({ ...form, extraBedPrice: e.target.value })} />
          </div>
          <Select label="أيام التطبيق" value={form.applyDays} onChange={(e) => setForm({ ...form, applyDays: e.target.value })} options={daysOptions} />
          <Select label="سياسة الإلغاء" value={form.cancellationPolicyId} onChange={(e) => setForm({ ...form, cancellationPolicyId: e.target.value })} options={[{ value: '', label: 'بدون' }, ...policies.map((p) => ({ value: p.id, label: p.nameAr || p.name }))]} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="تعديل خطة سعر" size="lg">
        <form onSubmit={updatePlan} className="space-y-4">
          <Input label="الاسم (عربي)" value={editForm.nameAr} onChange={(e) => setEditForm({ ...editForm, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Select label="نوع الغرفة" value={editForm.roomTypeId} onChange={(e) => setEditForm({ ...editForm, roomTypeId: e.target.value })} options={roomTypes.map((rt) => ({ value: rt.id, label: rt.nameAr || rt.name }))} />
          <Input label="السعر لليلة (د.ل)" type="number" value={editForm.nightlyRate} onChange={(e) => setEditForm({ ...editForm, nightlyRate: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="تاريخ البداية" type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} required />
            <Input label="تاريخ النهاية" type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} required />
          </div>
          <Input label="أقل عدد ليالٍ" type="number" value={editForm.minStay} onChange={(e) => setEditForm({ ...editForm, minStay: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="الحد الأقصى للبالغين" type="number" min={1} value={editForm.maxAdults} onChange={(e) => setEditForm({ ...editForm, maxAdults: e.target.value })} />
            <Input label="الحد الأقصى للأطفال" type="number" min={0} value={editForm.maxChildren} onChange={(e) => setEditForm({ ...editForm, maxChildren: e.target.value })} />
            <Input label="سعر السرير الإضافي (د.ل)" type="number" min={0} value={editForm.extraBedPrice} onChange={(e) => setEditForm({ ...editForm, extraBedPrice: e.target.value })} />
          </div>
          <Select label="أيام التطبيق" value={editForm.applyDays} onChange={(e) => setEditForm({ ...editForm, applyDays: e.target.value })} options={daysOptions} />
          <Select label="سياسة الإلغاء" value={editForm.cancellationPolicyId} onChange={(e) => setEditForm({ ...editForm, cancellationPolicyId: e.target.value })} options={[{ value: '', label: 'بدون' }, ...policies.map((p) => ({ value: p.id, label: p.nameAr || p.name }))]} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(null)}>إلغاء</Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
