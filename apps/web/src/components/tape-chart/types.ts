export interface TapeChartRoom {
  id: string;
  roomNumber: string;
  floor: number | null;
  status: string;
  housekeepingStatus: string;
  roomType: {
    id: string;
    name: string;
    nameAr: string | null;
    baseRate: number;
  };
}

export interface TapeChartBooking {
  id: string;
  bookingId: string;
  bookingNo: string;
  guestName: string | null;
  guestPhone: string | null;
  status: string;
  roomId: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  folioBalance: number;
}

export interface TapeChartUnassignedBooking {
  bookingRoomId: string;
  bookingId: string;
  bookingNo: string;
  guestName: string | null;
  guestPhone: string | null;
  status: string;
  source: string;
  roomId: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  checkIn: string;
  checkOut: string;
  folioBalance: number;
}

export interface TapeChartRoomTypeOption {
  id: string;
  name: string;
  nameAr: string | null;
}

export interface TapeChartFilterOptions {
  roomTypes: TapeChartRoomTypeOption[];
  floors: number[];
}

export interface TapeChartFilters {
  q: string;
  roomTypeId: string;
  floor: string;
  status: string;
}

export interface TapeChartData {
  rooms: TapeChartRoom[];
  bookingRooms: TapeChartBooking[];
  unassignedBookings: TapeChartUnassignedBooking[];
  filterOptions: TapeChartFilterOptions;
  dateRange: { from: string; to: string };
}

export interface DragState {
  isDragging: boolean;
  booking: TapeChartBooking | null;
  sourceRoomId: string;
  dragType: 'move' | 'extend' | null;
  startX: number;
  startCol: number;
}

export interface DropResult {
  action: 'move-room' | 'extend';
  bookingId: string;
  targetRoomId?: string;
  newCheckOut?: string;
}
