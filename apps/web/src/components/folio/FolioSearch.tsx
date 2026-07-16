'use client';

import { useState } from 'react';
import { Card, Input, Button } from '@/components/ui';

interface Props {
  onSearch: (bookingId: string) => void;
}

export function FolioSearch({ onSearch }: Props) {
  const [searchInput, setSearchInput] = useState('');

  return (
    <Card title="🔍 بحث عن فاتورة">
      <div className="space-y-3">
        <Input
          placeholder="رقم الحجز"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch(searchInput); }}
        />
        <Button className="w-full" onClick={() => onSearch(searchInput)}>بحث</Button>
      </div>
    </Card>
  );
}
