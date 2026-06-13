'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Modal, Badge, EmptyState, Table } from '@/components/ui';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'RECEPTION' });

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });
      setShowCreate(false);
      setNewUser({ name: '', email: '', password: '', role: 'RECEPTION' });
      fetchUsers();
    } catch {}
  }

  const columns = [
    { key: 'name', header: 'الاسم', render: (u: User) => <span className="font-semibold">{u.name}</span> },
    { key: 'email', header: 'البريد' },
    {
      key: 'role', header: 'الصلاحية',
      render: (u: User) => (
        <Badge variant={u.role === 'ADMIN' ? 'gold' : u.role === 'MANAGER' ? 'purple' : 'blue'}>
          {u.role === 'ADMIN' ? 'مدير النظام' : u.role === 'MANAGER' ? 'مدير' : 'استقبال'}
        </Badge>
      ),
    },
    {
      key: 'isActive', header: 'الحالة',
      render: (u: User) => (
        <Badge variant={u.isActive ? 'green' : 'red'}>{u.isActive ? 'نشط' : 'موقوف'}</Badge>
      ),
    },
    {
      key: 'lastLoginAt', header: 'آخر دخول',
      render: (u: User) => (
        <span className="text-[var(--text-muted)] text-xs">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('ar-LY') : '—'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">👥 إدارة المستخدمين</h1>
        <Button onClick={() => setShowCreate(true)}>+ مستخدم جديد</Button>
      </div>

      <Table
        columns={columns}
        data={users}
        keyExtractor={(u) => u.id}
        loading={loading}
        emptyMessage="لا يوجد مستخدمون بعد"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إضافة مستخدم جديد">
        <form onSubmit={createUser} className="space-y-4">
          <Input label="الاسم" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
          <Input label="البريد الإلكتروني" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
          <Input label="كلمة المرور" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
          <Select
            label="الصلاحية"
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            options={[
              { value: 'ADMIN', label: 'مدير النظام' },
              { value: 'MANAGER', label: 'مدير' },
              { value: 'RECEPTION', label: 'استقبال' },
            ]}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
