'use client';

export interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  status: string;
  roomType: {
    id: string;
    name: string;
    nameAr: string | null;
    baseRate: number;
    capacity: number;
  };
  bookingRooms: Array<{
    booking: { checkIn: string; checkOut: string };
  }>;
}

export interface RatePlanOption {
  id: string;
  name: string;
  nameAr: string | null;
  nightlyRate: number;
  minStay: number;
  maxAdults: number;
  maxChildren: number;
  extraBedPrice: number | null;
  cancellationPolicyName?: string;
}
