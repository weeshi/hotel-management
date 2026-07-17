'use client';

import { Modal, Input, Select, Button } from '@/components/ui';

interface Room { id: string; roomNumber: string; roomType: { name: string } }
interface User { id: string; name: string; email: string; role: string }
interface TaskType { id: string; name: string; nameAr?: string; icon?: string }

interface Props {
  open: boolean;
  form: { roomId: string; taskType: string; priority: string; assignedTo: string; notes: string };
  rooms: Room[];
  users?: User[];
  taskTypes?: TaskType[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onFormChange: (form: any) => void;
}

export function CreateTaskModal({ open, form, rooms, users = [], taskTypes = [], onSubmit, onClose, onFormChange }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="إضافة مهمة جديدة">
      <form onSubmit={onSubmit} className="space-y-4">
        <Select label="الغرفة" value={form.roomId} onChange={(e) => onFormChange({ ...form, roomId: e.target.value })}
          options={rooms.map(r => ({ value: r.id, label: `${r.roomNumber} - ${r.roomType?.name}` }))} placeholder="اختر الغرفة" />
        <Select label="نوع المهمة" value={form.taskType} onChange={(e) => onFormChange({ ...form, taskType: e.target.value })}
          options={taskTypes.map(tt => ({ value: tt.name, label: `${tt.icon || ''} ${tt.nameAr || tt.name}` }))} />
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
          <Button type="submit">إضافة</Button>
        </div>
      </form>
    </Modal>
  );
}
