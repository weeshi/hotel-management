'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Modal, Badge, EmptyState, Table } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface CancellationPolicy {
  id: string;
  name: string;
  nameAr?: string;
  rules: string;
  isActive: boolean;
  _count: { ratePlans: number };
}

export default function AdminCancellationPoliciesPage() {
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<CancellationPolicy | null>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', rules: '' });
  const [editForm, setEditForm] = useState({ name: '', nameAr: '', rules: '' });

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch('/api/admin/cancellation-policies', { headers });
      const data = await res.json();
      if (data.success) setPolicies(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    await getCsrfToken();
    try {
      await fetch('/api/admin/cancellation-policies', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ name: '', nameAr: '', rules: '' });
      fetchData();
    } catch {}
  }

  async function updatePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!showEdit) return;
    await getCsrfToken();
    try {
      await fetch(`/api/admin/cancellation-policies/${showEdit.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(editForm),
      });
      setShowEdit(null);
      fetchData();
    } catch {}
  }

  async function deletePolicy(p: CancellationPolicy) {
    if (!confirm(`حذف "${p.name}"؟`)) return;
    await getCsrfToken();
    try {
      await fetch(`/api/admin/cancellation-policies/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, ...csrfHeaders() } });
      fetchData();
    } catch {}
  }

  const columns = [
    { key: 'name', header: 'الاسم', render: (p: CancellationPolicy) => <span className="font-semibold">{p.nameAr || p.name}</span> },
    { key: 'rules', header: 'القواعد', render: (p: CancellationPolicy) => <span className="text-xs text-[var(--text-muted)] max-w-[300px] truncate">{p.rules}</span> },
    { key: 'usage', header: 'المستخدمة في', render: (p: CancellationPolicy) => <span className="text-xs">{p._count?.ratePlans || 0} خطة</span> },
    {
      key: 'actions', header: 'إجراءات',
      render: (p: CancellationPolicy) => (
        <div className="flex gap-2">
          <button onClick={() => { setEditForm({ name: p.name, nameAr: p.nameAr || '', rules: p.rules }); setShowEdit(p); }} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
          <button onClick={() => deletePolicy(p)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
        </div>
      ),
    },
  ];

  return (
    <div data-component="AdminCancellationPoliciesPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">❌ سياسات الإلغاء</h1>
        <Button onClick={() => setShowCreate(true)}>+ سياسة جديدة</Button>
      </div>

      <Table columns={columns} data={policies} keyExtractor={(p) => p.id} loading={loading} emptyMessage="لا توجد سياسات إلغاء بعد" />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إضافة سياسة إلغاء" size="lg">
        <form onSubmit={createPolicy} className="space-y-4">
          <Input label="الاسم (عربي)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">القواعد (JSON)</label>
            <textarea
              value={form.rules}
              onChange={(e) => setForm({ ...form, rules: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] font-mono text-xs min-h-[120px]"
              placeholder='{"refundPercentage": 100, "cancelBeforeHours": 48}'
              required
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="تعديل سياسة إلغاء" size="lg">
        <form onSubmit={updatePolicy} className="space-y-4">
          <Input label="الاسم (عربي)" value={editForm.nameAr} onChange={(e) => setEditForm({ ...editForm, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">القواعد (JSON)</label>
            <textarea
              value={editForm.rules}
              onChange={(e) => setEditForm({ ...editForm, rules: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] font-mono text-xs min-h-[120px]"
              required
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(null)}>إلغاء</Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
