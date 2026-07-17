'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { addToast } from '@/lib/utils/toast';

// --- Types ---

interface Room {
  id: string;
  roomNumber: string;
  floor: number | null;
  roomType: { name: string };
}

export interface WorkerTask {
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

// --- State Machine ---

const NEXT_STATUS: Record<string, string | null> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: null,
  CANCELLED: null,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغية',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

const STATUS_BUTTON_LABELS: Record<string, string> = {
  PENDING: '▶️ بدء التنفيذ',
  IN_PROGRESS: '✅ إكمال المهمة',
};

// --- Hook ---

export function useWorkerTasks(taskType: 'CLEANING' | 'MAINTENANCE') {
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter ? `&status=${filter}` : '';
      const res = await fetch(`/api/admin/housekeeping?taskType=${taskType}${q}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setTasks(data.data);
    } finally {
      setLoading(false);
    }
  }, [taskType, filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function updateTaskStatus(task: WorkerTask) {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;

    setUpdatingId(task.id);
    await getCsrfToken();

    try {
      const res = await fetch(`/api/admin/housekeeping/${task.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();

      if (data.success) {
        addToast('success', `✅ تم تغيير الحالة إلى ${STATUS_LABELS[nextStatus]}`);
        fetchTasks();
      } else {
        addToast('error', data.error?.message || 'فشل تحديث الحالة');
      }
    } catch {
      addToast('error', 'حدث خطأ في الاتصال');
    } finally {
      setUpdatingId(null);
    }
  }

  return {
    tasks,
    loading,
    filter,
    setFilter,
    updatingId,
    updateTaskStatus,
    STATUS_LABELS,
    PRIORITY_LABELS,
    STATUS_BUTTON_LABELS,
    NEXT_STATUS,
  };
}
