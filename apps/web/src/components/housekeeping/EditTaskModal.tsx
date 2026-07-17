'use client';

import { Modal, Input, Select, Button } from '@/components/ui';

interface HousekeepingTask { id: string; room: { roomNumber: string }; taskType: string }
interface User { id: string; name: string; email: string; role: string }

interface Props {
  open: boolean;
  task: HousekeepingTask | null;
  form: { status: string; priority: string; assignedTo: string; notes: string; taskType: string };
  typeLabels: Record<string, string>;
  users?: User[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onFormChange: (form: any) => void;
}

export function EditTaskModal({ open, task, form, typeLabels, users = [], onSubmit, onClose, onFormChange }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="تعديل المهمة">
      <form onSubmit={onSubmit} className="space-y-4">
        {task && (
          <div className="text-sm text-[var(--text-secondary)] mb-2">
            الغرفة: <span className="font-semibold text-[var(--text-primary)]">{task.room.roomNumber}</span>
            {' | '} النوع: <span className="font-semibold text-[var(--text-primary)]">{typeLabels[task.taskType] || task.taskType}</span>
          </div>
        )}
        <Select label="الحالة" value={form.status} onChange={(e) => onFormChange({ ...form, status: e.target.value })}
          options={[
            { value: 'PENDING', label: 'قيد الانتظار' }, { value: 'IN_PROGRESS', label: 'قيد التنفيذ' },
            { value: 'COMPLETED', label: 'مكتملة' }, { value: 'CANCELLED', label: 'ملغية' },
          ]} />
        <Select label="الأولوية" value={form.priority} onChange={(e) => onFormChange({ ...form, priority: e.target.value })}
          options={[
            { value: 'LOW', label: 'منخفضة' }, { value: 'NORMAL', label: 'عادية' },
            { value: 'HIGH', label: 'عالية' }, { value: 'URGENT', label: 'عاجلة' },
          ]} />
        <Select label="مسؤول التنفيذ" value={form.assignedTo} onChange={(e) => onFormChange({ ...form, assignedTo: e.target.value })}
          options={[
            { value: '', label: '— غير محدد —' },
            ...users.map(u => ({ value: u.name, label: `${u.name} (${u.role === 'ADMIN' ? 'مدير' : u.role === 'MANAGER' ? 'مدير' : 'استقبال'})` })),
          ]} />
        <Input label="ملاحظات" value={form.notes} onChange={(e) => onFormChange({ ...form, notes: e.target.value })} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>إلغاء</Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Modal>
  );
}
