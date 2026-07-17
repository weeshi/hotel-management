'use client';

import { useWorkerTasks } from '@/hooks/useWorkerTasks';
import { TaskCard } from '@/components/worker/TaskCard';

// --- Component ---

export default function WorkerMaintenancePage() {
  const {
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
  } = useWorkerTasks('MAINTENANCE');

  return (
    <div data-component="WorkerMaintenancePage" className="max-w-2xl mx-auto px-4 py-4">
      <h1 className="text-xl font-bold mb-4">🔧 مهام الصيانة</h1>

      {/* --- Status Filter Tabs --- */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {['', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === s
                ? 'bg-[var(--gold)] text-black'
                : 'bg-[var(--bg-card)] border border-[var(--border)]'
            }`}
          >
            {STATUS_LABELS[s as keyof typeof STATUS_LABELS] || 'الكل'}
          </button>
        ))}
      </div>

      {/* --- Task List --- */}
      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">جاري التحميل...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">لا توجد مهام حالياً</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdateStatus={updateTaskStatus}
              isUpdating={updatingId === task.id}
              STATUS_LABELS={STATUS_LABELS}
              PRIORITY_LABELS={PRIORITY_LABELS}
              STATUS_BUTTON_LABELS={STATUS_BUTTON_LABELS}
              NEXT_STATUS={NEXT_STATUS}
            />
          ))}
        </div>
      )}
    </div>
  );
}
