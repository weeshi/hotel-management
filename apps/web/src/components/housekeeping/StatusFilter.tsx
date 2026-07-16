'use client';

import { Select } from '@/components/ui';

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export function StatusFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <Select
        label="تصفية حسب الحالة"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: '', label: 'الكل' },
          { value: 'PENDING', label: 'قيد الانتظار' },
          { value: 'IN_PROGRESS', label: 'قيد التنفيذ' },
          { value: 'COMPLETED', label: 'مكتملة' },
          { value: 'CANCELLED', label: 'ملغية' },
        ]}
      />
    </div>
  );
}
