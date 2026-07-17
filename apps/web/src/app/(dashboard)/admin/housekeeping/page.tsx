'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Table } from '@/components/ui';
import { apiPost, apiPut, apiDelete } from '@/lib/utils/api-mutation';
import { SummaryCards } from '@/components/housekeeping/SummaryCards';
import { StatusFilter } from '@/components/housekeeping/StatusFilter';
import { CreateTaskModal } from '@/components/housekeeping/CreateTaskModal';
import { EditTaskModal } from '@/components/housekeeping/EditTaskModal';

interface Room { id: string; roomNumber: string; floor: number | null; roomType: { name: string } }
interface User { id: string; name: string; email: string; role: string }
interface TaskType { id: string; name: string; nameAr?: string; icon?: string }
interface HousekeepingTask {
  id: string; roomId: string; taskType: string; priority: string; assignedTo: string | null;
  notes: string | null; status: string; completedAt: string | null; createdAt: string; room: Room;
}

const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const priorityColors: Record<string, 'red' | 'yellow' | 'blue' | 'gold'> = { URGENT: 'red', HIGH: 'yellow', NORMAL: 'blue', LOW: 'gold' };
const statusColors: Record<string, 'gold' | 'blue' | 'green' | 'red'> = { PENDING: 'gold', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red' };
const statusLabels: Record<string, string> = { PENDING: 'قيد الانتظار', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتملة', CANCELLED: 'ملغية' };
const typeLabels: Record<string, string> = { CLEANING: 'تنظيف', MAINTENANCE: 'صيانة', INSPECTION: 'تفتيش', LAUNDRY: 'غسيل', MINIBAR: 'ميني بار', OTHER: 'أخرى' };
const priorityLabels: Record<string, string> = { LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عالية', URGENT: 'عاجلة' };

export default function AdminHousekeepingPage() {
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<HousekeepingTask | null>(null);
  const [form, setForm] = useState({ roomId: '', taskType: 'CLEANING', priority: 'NORMAL', assignedTo: '', notes: '' });
  const [editForm, setEditForm] = useState({ status: 'PENDING', priority: 'NORMAL', assignedTo: '', notes: '', taskType: 'CLEANING' });

  async function fetchTasks() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const base = '/api/admin/housekeeping?taskType=CLEANING';
      const url = filterStatus ? `${base}&status=${filterStatus}` : base;
      const [tasksRes, roomsRes, usersRes, ttRes] = await Promise.all([
        fetch(url, { headers }), fetch('/api/admin/rooms', { headers }), fetch('/api/admin/users', { headers }), fetch('/api/admin/task-types', { headers }),
      ]);
      const tasksData = await tasksRes.json();
      const roomsData = await roomsRes.json();
      const usersData = await usersRes.json();
      const ttData = await ttRes.json();
      if (tasksData.success) setTasks(tasksData.data);
      if (roomsData.success) setRooms(roomsData.data);
      if (usersData.success) setUsers(usersData.data);
      if (ttData.success) setTaskTypes(ttData.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchTasks(); }, [filterStatus]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    await apiPost('/api/admin/housekeeping', form, {
      successMsg: '✅ تم إنشاء المهمة',
      errorMsg: 'فشل إنشاء المهمة',
      onSuccess: () => {
        setShowCreate(false);
        setForm({ roomId: '', taskType: 'CLEANING', priority: 'NORMAL', assignedTo: '', notes: '' });
        fetchTasks();
      },
    });
  }

  async function updateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!showEdit) return;
    const body: any = {};
    if (editForm.status !== showEdit.status) body.status = editForm.status;
    if (editForm.priority !== showEdit.priority) body.priority = editForm.priority;
    if (editForm.assignedTo !== (showEdit.assignedTo || '')) body.assignedTo = editForm.assignedTo || undefined;
    if (editForm.notes !== (showEdit.notes || '')) body.notes = editForm.notes || undefined;
    if (editForm.taskType !== showEdit.taskType) body.taskType = editForm.taskType;
    if (Object.keys(body).length === 0) { setShowEdit(null); return; }

    await apiPut(`/api/admin/housekeeping/${showEdit.id}`, body, {
      successMsg: '✅ تم تحديث المهمة',
      errorMsg: 'فشل تحديث المهمة',
      onSuccess: () => { setShowEdit(null); fetchTasks(); },
    });
  }

  async function deleteTask(task: HousekeepingTask) {
    if (!confirm('هل أنت متأكد من حذف المهمة؟')) return;
    await apiDelete(`/api/admin/housekeeping/${task.id}`, {
      successMsg: '✅ تم حذف المهمة',
      errorMsg: 'فشل حذف المهمة',
      onSuccess: () => fetchTasks(),
    });
  }

  const columns = [
    { key: 'room', header: 'الغرفة', render: (t: HousekeepingTask) => <span className="font-semibold">{t.room.roomNumber}</span> },
    { key: 'taskType', header: 'النوع', render: (t: HousekeepingTask) => <span className="text-xs text-[var(--text-muted)]">{typeLabels[t.taskType] || t.taskType}</span> },
    { key: 'priority', header: 'الأولوية', render: (t: HousekeepingTask) => <Badge variant={priorityColors[t.priority]}>{priorityLabels[t.priority] || t.priority}</Badge> },
    { key: 'status', header: 'الحالة', render: (t: HousekeepingTask) => <Badge variant={statusColors[t.status]}>{statusLabels[t.status] || t.status}</Badge> },
    { key: 'assignedTo', header: 'المسؤول', render: (t: HousekeepingTask) => <span className="text-sm text-[var(--text-secondary)]">{t.assignedTo || '—'}</span> },
    {
      key: 'actions', header: 'إجراءات',
      render: (t: HousekeepingTask) => (
        <div className="flex gap-2">
          <button onClick={() => { setEditForm({ status: t.status, priority: t.priority, assignedTo: t.assignedTo || '', notes: t.notes || '', taskType: t.taskType }); setShowEdit(t); }} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
          <button onClick={() => deleteTask(t)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
        </div>
      ),
    },
  ];

  const summaryStats = [
    { label: 'إجمالي المهام', value: tasks.length, icon: '📋', color: 'var(--gold)' },
    { label: 'قيد الانتظار', value: tasks.filter(t => t.status === 'PENDING').length, icon: '⏳', color: 'var(--yellow)' },
    { label: 'قيد التنفيذ', value: tasks.filter(t => t.status === 'IN_PROGRESS').length, icon: '🔧', color: 'var(--blue)' },
    { label: 'مكتملة اليوم', value: tasks.filter(t => t.status === 'COMPLETED').length, icon: '✅', color: 'var(--green)' },
  ];

  return (
    <div data-component="AdminHousekeepingPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🧹 إدارة التدبير المنزلي</h1>
        <Button onClick={() => setShowCreate(true)}>+ مهمة جديدة</Button>
      </div>

      <SummaryCards stats={summaryStats} />
      <StatusFilter value={filterStatus} onChange={setFilterStatus} />

      <Table columns={columns} data={tasks} keyExtractor={(t) => t.id} loading={loading} emptyMessage="لا توجد مهام تدبير منزلي" />

      <CreateTaskModal open={showCreate} form={form} rooms={rooms} users={users} taskTypes={taskTypes} onSubmit={createTask} onClose={() => setShowCreate(false)} onFormChange={setForm} />
      <EditTaskModal open={!!showEdit} task={showEdit} form={editForm} typeLabels={typeLabels} users={users} onSubmit={updateTask} onClose={() => setShowEdit(null)} onFormChange={setEditForm} />
    </div>
  );
}
