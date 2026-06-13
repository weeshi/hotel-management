import { z } from 'zod';
import {
  Role,
  BookingStatus,
  BookingSource,
  FolioStatus,
  PaymentMethod,
  RoomStatus,
} from './enums';

export const loginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().optional(),
  role: z.nativeEnum(Role),
});

export const createRoomTypeSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  baseRate: z.number().positive(),
  capacity: z.number().int().positive(),
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
});

export const createRoomSchema = z.object({
  roomNumber: z.string().min(1),
  floor: z.number().int().optional(),
  roomTypeId: z.string().uuid(),
  status: z.nativeEnum(RoomStatus).optional(),
  notes: z.string().optional(),
});

export const createBookingSchema = z.object({
  guestId: z.string().uuid().optional(),
  guestName: z.string().min(2).optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  adults: z.number().int().positive().default(1),
  children: z.number().int().min(0).default(0),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  rooms: z.array(
    z.object({
      roomId: z.string().uuid(),
      ratePlanId: z.string().uuid().optional(),
      nightlyRate: z.number().positive(),
    })
  ).min(1),
  services: z.array(
    z.object({
      serviceId: z.string().uuid(),
      quantity: z.number().int().positive().default(1),
    })
  ).optional(),
  source: z.nativeEnum(BookingSource).default(BookingSource.WEBSITE),
});

export const createServiceSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  price: z.number().positive(),
  categoryId: z.string().uuid(),
  isActive: z.boolean().default(true),
});

export const createPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  currency: z.string().default('LYD'),
});

export const addFolioChargeSchema = z.object({
  folioId: z.string().uuid(),
  description: z.string().min(1),
  amount: z.number().positive(),
  category: z.string(),
  referenceId: z.string().optional(),
});

export const applyDiscountSchema = z.object({
  folioId: z.string().uuid(),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().positive(),
  reason: z.string().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ===== Schemas needed by types.ts =====

export const registerSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email: z.string().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  phone: z.string().optional(),
});

export const hotelSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  currency: z.string().default('LYD'),
  checkInTime: z.string().default('14:00'),
  checkOutTime: z.string().default('12:00'),
});

export const guestSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  nationality: z.string().optional(),
  idNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const folioTransactionSchema = z.object({
  folioId: z.string().uuid(),
  type: z.enum(['CHARGE', 'PAYMENT', 'REFUND', 'DISCOUNT']),
  category: z.enum(['ROOM_CHARGE', 'SERVICE', 'TAX', 'DISCOUNT', 'PAYMENT', 'REFUND']),
  description: z.string().min(1),
  amount: z.number(),
  createdById: z.string().uuid().optional(),
});

export const auditLogSchema = z.object({
  hotelId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  action: z.string().min(1),
  entity: z.string().min(1),
  entityId: z.string(),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});
