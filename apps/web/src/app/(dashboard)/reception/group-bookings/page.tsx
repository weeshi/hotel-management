'use client';

import { useState, useEffect } from 'react';
import { Button, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';
import { CreateGroupModal, GroupBookingCard } from '@/components/group-bookings';
import type { GroupBookingData } from '@/components/group-bookings/types';

export default function GroupBookingsPage() {
  const [groups, setGroups] = useState<GroupBookingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState<any>(null);

  async function fetchGroups() {
    setLoading(true);
    try {
      const res = await apiGet('/api/admin/group-bookings');
      if (res.success) setGroups(res.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    fetchGroups();
  }, []);

  return (
    <div data-component="GroupBookingsPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">👥 الحجوزات الجماعية</h1>
        <Button onClick={() => setShowCreate(true)} size="lg">
          + مجموعة جديدة
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="👥"
          title="لا توجد مجموعات"
          description="أنشئ مجموعة جديدة لإدارة الحجوزات الجماعية والتحكم بالفواتير الموحدة"
          action={<Button onClick={() => setShowCreate(true)}>إنشاء مجموعة</Button>}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <GroupBookingCard
              key={g.id}
              group={g}
              hotelId={user?.hotelId || ''}
              onRefresh={fetchGroups}
            />
          ))}
        </div>
      )}

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={fetchGroups}
      />
    </div>
  );
}
