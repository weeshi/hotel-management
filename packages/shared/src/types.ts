import { z } from 'zod';
import {
  loginSchema, registerSchema, hotelSchema,
  createRoomTypeSchema, createRoomSchema, guestSchema,
  createBookingSchema, createPaymentSchema, createServiceSchema,
  addFolioChargeSchema, folioTransactionSchema, applyDiscountSchema,
  createRatePlanSchema, createCancellationPolicySchema,
  createHousekeepingSchema, updateHousekeepingSchema,
  createMenuCategorySchema, createMenuItemSchema,
  createRestaurantOrderSchema, updateRestaurantOrderSchema,
  auditLogSchema,
  createSafeDepositSchema, addSafeDepositItemSchema, closeSafeDepositSchema,
  createLostItemSchema, updateLostItemSchema,
  reportSettingsSchema, reportExportSchema, reportShareSchema,
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
export type RatePlanInput = z.infer<typeof createRatePlanSchema>;
export type CancellationPolicyInput = z.infer<typeof createCancellationPolicySchema>;
export type CreateHousekeepingInput = z.infer<typeof createHousekeepingSchema>;
export type UpdateHousekeepingInput = z.infer<typeof updateHousekeepingSchema>;
export type AuditLogInput = z.infer<typeof auditLogSchema>;
export type MenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type MenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreateRestaurantOrderInput = z.infer<typeof createRestaurantOrderSchema>;
export type UpdateRestaurantOrderInput = z.infer<typeof updateRestaurantOrderSchema>;
export type CreateSafeDepositInput = z.infer<typeof createSafeDepositSchema>;
export type AddSafeDepositItemInput = z.infer<typeof addSafeDepositItemSchema>;
export type CloseSafeDepositInput = z.infer<typeof closeSafeDepositSchema>;
export type CreateLostItemInput = z.infer<typeof createLostItemSchema>;
export type UpdateLostItemInput = z.infer<typeof updateLostItemSchema>;
export type ReportSettingsInput = z.infer<typeof reportSettingsSchema>;
export type ReportExportInput = z.infer<typeof reportExportSchema>;
export type ReportShareInput = z.infer<typeof reportShareSchema>;

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
