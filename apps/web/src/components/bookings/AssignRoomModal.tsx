'use client';

import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/utils/api-client';

interface AvailableRoom {
  id: string;
  roomNumber: string;
  floor: number | null;
  roomTypeId: string;
}

interface AssignRoomModalProps {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  bookingRoomId: string;
  roomTypeId: string | null;
  roomTypeName?: string;
  checkIn: string;
  checkOut: string;
  onAssigned: () => void;
}

// --- M4: physical room assignment for room-type (web) reservations ---

export function AssignRoomModal({
  open,
  onClose,
  bookingId,
  bookingRoomId,
  roomTypeId,
  roomTypeName,
  checkIn,
  checkOut,
  onAssigned,
}: AssignRoomModalProps) {
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setSelectedRoomId('');
    setAssignmentError(null);
    setIsLoading(true);
    setAvailableRooms([]);

    const query = new URLSearchParams({ checkIn, checkOut });
    apiGet<AvailableRoom[]>(`/api/admin/rooms/available?${query.toString()}`).then((response) => {
      if (cancelled) return;
      if (response.success) {
        setAvailableRooms(
          response.data.filter((room) => !roomTypeId || room.roomTypeId === roomTypeId),
        );
      } else {
        setAssignmentError(response.error.message);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, checkIn, checkOut, roomTypeId]);

  // --- Actions ---
  async function submitRoomAssignment() {
    if (!selectedRoomId) return;

    setIsSubmitting(true);
    setAssignmentError(null);

    const response = await apiPost(`/api/admin/bookings/${bookingId}/assign-room`, {
      bookingRoomId,
      roomId: selectedRoomId,
    });

    setIsSubmitting(false);

    if (response.success) {
      onAssigned();
      onClose();
    } else {
      setAssignmentError(response.error.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`تخصيص غرفة — ${roomTypeName || 'غرفة'}`}>
      <div data-component="assign-room-modal" className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          اختر غرفة فيزيائية متاحة لنفس نوع الغرفة خلال فترة الحجز.
        </p>

        {isLoading && (
          <p className="text-sm text-[var(--text-muted)]">جارٍ تحميل الغرف المتاحة...</p>
        )}

        {!isLoading && availableRooms.length === 0 && !assignmentError && (
          <p className="text-sm text-[var(--text-muted)]">
            لا توجد غرف متاحة من هذا النوع في التواريخ المحددة.
          </p>
        )}

        {!isLoading && availableRooms.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {availableRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  selectedRoomId === room.id
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-bold'
                    : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                {room.roomNumber}
              </button>
            ))}
          </div>
        )}

        {assignmentError && <p className="text-sm text-red-500">{assignmentError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            onClick={submitRoomAssignment}
            disabled={!selectedRoomId || isSubmitting}
          >
            {isSubmitting ? 'جارٍ التخصيص...' : 'تأكيد التخصيص'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
