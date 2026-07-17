'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Modal, Badge, EmptyState, Table } from '@/components/ui';
import { apiPost, apiPut, apiMutation } from '@/lib/utils/api-mutation';

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
  const [showEdit, setShowEdit] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'RECEPTION' });
  const [editUser, setEditUser] = useState({ name: '', email: '', role: 'RECEPTION', password: '' });

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
    await apiPost('/api/admin/users', newUser, {
      successMsg: '✅ تم إنشاء المستخدم',
      errorMsg: 'فشل إنشاء المستخدم',
      onSuccess: () => {
        setShowCreate(false);
        setNewUser({ name: '', email: '', password: '', role: 'RECEPTION' });
        fetchUsers();
      },
    });
  }

  async function updateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!showEdit) return;
    const body: any = { name: editUser.name, email: editUser.email, role: editUser.role };
    if (editUser.password) body.password = editUser.password;
    await apiPut(`/api/admin/users/${showEdit.id}`, body, {
      successMsg: '✅ تم تحديث المستخدم',
      errorMsg: 'فشل تحديث المستخدم',
      onSuccess: () => { setShowEdit(null); fetchUsers(); },
    });
  }

  async function toggleActive(user: User) {
    await apiMutation({ method: 'PATCH', url: `/api/admin/users/${user.id}`, successMsg: '✅ تم تغيير حالة المستخدم', errorMsg: 'فشل تغيير حالة المستخدم', onSuccess: () => fetchUsers() });
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
    {
      key: 'actions', header: 'إجراءات',
      render: (u: User) => (
        <div className="flex gap-2">
          <button
            onClick={() => { setEditUser({ name: u.name, email: u.email, role: u.role, password: '' }); setShowEdit(u); }}
            className="text-xs text-[var(--blue)] hover:underline"
          >
            تعديل
          </button>
          <button
            onClick={() => toggleActive(u)}
            className={`text-xs hover:underline ${u.isActive ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}
          >
            {u.isActive ? 'تعطيل' : 'تفعيل'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div data-component="AdminUsersPage">
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

      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="تعديل مستخدم">
        <form onSubmit={updateUser} className="space-y-4">
          <Input label="الاسم" value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} required />
          <Input label="البريد الإلكتروني" type="email" value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} required />
          <Input label="كلمة المرور (اتركها فارغة إن لم ترد التغيير)" type="password" value={editUser.password} onChange={(e) => setEditUser({ ...editUser, password: e.target.value })} />
          <Select
            label="الصلاحية"
            value={editUser.role}
            onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
            options={[
              { value: 'ADMIN', label: 'مدير النظام' },
              { value: 'MANAGER', label: 'مدير' },
              { value: 'RECEPTION', label: 'استقبال' },
            ]}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(null)}>إلغاء</Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
