'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Card, Select } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface Room {
  id: string;
  roomNumber: string;
  floor: number | null;
  roomType: { name: string };
}

interface HousekeepingTask {
  id: string;
  roomId: string;
  taskType: string;
  priority: string;
  assignedTo: string | null;
  notes: string | null;
  status: string;
  completedAt: string | null;
  createdAt: string;
  room: Room;
}

const statusColors: Record<string, 'gold' | 'blue' | 'green' | 'red'> = { PENDING: 'gold', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red' };
const statusLabels: Record<string, string> = { PENDING: 'قيد الانتظار', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتملة', CANCELLED: 'ملغية' };
const typeLabels: Record<string, string> = { CLEANING: 'تنظيف', MAINTENANCE: 'صيانة', INSPECTION: 'تفتيش', LAUNDRY: 'غسيل', MINIBAR: 'ميني بار', OTHER: 'أخرى' };
const priorityLabels: Record<string, string> = { LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عالية', URGENT: 'عاجلة' };
const priorityColors: Record<string, string> = { LOW: '#6b7280', NORMAL: 'var(--blue)', HIGH: 'var(--yellow)', URGENT: 'var(--red)' };

export default function ReceptionHousekeepingPage() {
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  async function fetchTasks() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const base = '/api/admin/housekeeping?taskType=CLEANING';
      const url = filterStatus ? `${base}&status=${filterStatus}` : base;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) setTasks(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTasks(); }, [filterStatus]);

  async function updateStatus(task: HousekeepingTask, newStatus: string) {
    await getCsrfToken();
    try {
      await fetch(`/api/admin/housekeeping/${task.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTasks();
    } catch {}
  }

  return (
    <div data-component="ReceptionHousekeepingPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🧹 مهام التدبير المنزلي</h1>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <Select
          label="تصفية حسب الحالة"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          options={[
            { value: '', label: 'الكل' },
            { value: 'PENDING', label: 'قيد الانتظار' },
            { value: 'IN_PROGRESS', label: 'قيد التنفيذ' },
            { value: 'COMPLETED', label: 'مكتملة' },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">لا توجد مهام تدبير منزلي</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <Card key={task.id} className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{task.room.roomNumber}</span>
                  <span className="text-xs text-[var(--text-muted)]">{task.room.roomType?.name}</span>
                </div>
                <Badge variant={statusColors[task.status]}>{statusLabels[task.status] || task.status}</Badge>
              </div>

              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">النوع:</span>
                  <span>{typeLabels[task.taskType] || task.taskType}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">الأولوية:</span>
                  <span className="font-semibold" style={{ color: priorityColors[task.priority] }}>{priorityLabels[task.priority] || task.priority}</span>
                </div>
                {task.assignedTo && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">المسؤول:</span>
                    <span>{task.assignedTo}</span>
                  </div>
                )}
                {task.notes && (
                  <div className="text-sm text-[var(--text-secondary)] mt-1">
                    📝 {task.notes}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                {task.status === 'PENDING' && (
                  <Button size="sm" className="flex-1 !py-1.5 !text-xs" onClick={() => updateStatus(task, 'IN_PROGRESS')}>
                    ▶️ بدء التنفيذ
                  </Button>
                )}
                {task.status === 'IN_PROGRESS' && (
                  <>
                    <Button size="sm" className="flex-1 !py-1.5 !text-xs" variant="secondary" onClick={() => updateStatus(task, 'PENDING')}>
                      ⏸ إيقاف
                    </Button>
                    <Button size="sm" className="flex-1 !py-1.5 !text-xs" onClick={() => updateStatus(task, 'COMPLETED')}>
                      ✅ إكمال
                    </Button>
                  </>
                )}
                {task.status === 'COMPLETED' && (
                  <span className="text-xs text-[var(--green)] font-semibold py-1.5">✅ تم الإنجاز</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
