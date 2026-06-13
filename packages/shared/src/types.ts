import { z } from 'zod';
import {
  loginSchema, registerSchema, hotelSchema,
  createRoomTypeSchema, createRoomSchema, guestSchema,
  createBookingSchema, createPaymentSchema, createServiceSchema,
  addFolioChargeSchema, folioTransactionSchema, applyDiscountSchema,
  auditLogSchema,
} from './schemas';

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type HotelInput = z.infer<typeof hotelSchema>;
export type RoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type RoomInput = z.infer<typeof createRoomSchema>;
export type GuestInput = z.infer<typeof guestSchema>;
export type BookingInput = z.infer<typeof createBookingSchema>;
export type PaymentInput = z.infer<typeof createPaymentSchema>;
export type ServiceInput = z.infer<typeof createServiceSchema>;
export type FolioChargeInput = z.infer<typeof addFolioChargeSchema>;
export type FolioTransactionInput = z.infer<typeof folioTransactionSchema>;
export type FolioDiscountInput = z.infer<typeof applyDiscountSchema>;
export type AuditLogInput = z.infer<typeof auditLogSchema>;

// API response wrapper
export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>;
