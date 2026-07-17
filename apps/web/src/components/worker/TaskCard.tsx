'use client';

import { Card } from '@/components/ui';
import type { WorkerTask } from '@/hooks/useWorkerTasks';

// --- Types ---

interface TaskCardProps {
  task: WorkerTask;
  onUpdateStatus: (task: WorkerTask) => void;
  isUpdating: boolean;
  STATUS_LABELS: Record<string, string>;
  PRIORITY_LABELS: Record<string, string>;
  STATUS_BUTTON_LABELS: Record<string, string>;
  NEXT_STATUS: Record<string, string | null>;
}

// --- Helpers ---

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800';
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function actionButtonClass(status: string): string {
  return status === 'PENDING'
    ? 'bg-blue-600 text-white active:bg-blue-700'
    : 'bg-green-600 text-white active:bg-green-700';
}

// --- Component ---

export function TaskCard({
  task,
  onUpdateStatus,
  isUpdating,
  STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_BUTTON_LABELS,
  NEXT_STATUS,
}: TaskCardProps) {
  const nextStatus = NEXT_STATUS[task.status];

  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{task.room.roomNumber}</span>
          <span className="text-sm text-[var(--text-muted)]">{task.room.roomType?.name}</span>
        </div>
        <span
          className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(task.status)}`}
        >
          {STATUS_LABELS[task.status] || task.status}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)] mb-3">
        <span>🔹 {PRIORITY_LABELS[task.priority] || task.priority}</span>
        {task.assignedTo && <span>👤 {task.assignedTo}</span>}
      </div>

      {task.notes && (
        <div className="text-sm text-[var(--text-muted)] mb-3 bg-[var(--bg-primary)] rounded-lg p-2">
          📝 {task.notes}
        </div>
      )}

      {nextStatus && (
        <button
          onClick={() => onUpdateStatus(task)}
          disabled={isUpdating}
          className={`w-full py-3 rounded-xl text-base font-bold transition-all ${actionButtonClass(
            task.status
          )} disabled:opacity-50`}
        >
          {isUpdating ? 'جاري التحديث...' : STATUS_BUTTON_LABELS[task.status]}
        </button>
      )}
    </Card>
  );
}
