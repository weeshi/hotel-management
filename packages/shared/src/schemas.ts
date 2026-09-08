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
  amenityServiceIds: z.array(z.string()).optional(),
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
  capacityIncrease: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const createPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  currency: z.string().default('LYD'),
  externalRef: z.string().optional(),
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

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'رمز الدعوة مطلوب'),
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  phone: z.string().optional(),
});

export const customDomainSchema = z
  .string()
  .trim()
  .max(255, 'اسم النطاق طويل جداً')
  .nullable()
  .optional()
  .transform((value) =>
    value && value.trim() !== '' ? value.toLowerCase() : null
  )
  .refine(
    (value) =>
      value === null ||
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(value),
    'اسم النطاق غير صالح'
  );

export const updateHotelCustomDomainSchema = z.object({
  customDomain: customDomainSchema,
});

export const createHotelInvitationSchema = z.object({
  hotel: z.object({
    name: z.string().min(2, 'اسم الفندق يجب أن يكون حرفين على الأقل'),
    nameAr: z.string().optional(),
    customDomain: customDomainSchema,
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('البريد الإلكتروني غير صالح').optional(),
    currency: z.string().default('LYD'),
    checkInTime: z.string().default('14:00'),
    checkOutTime: z.string().default('12:00'),
  }),
  manager: z.object({
    email: z.string().email('البريد الإلكتروني غير صالح'),
    name: z.string().min(2, 'اسم المدير مطلوب').optional(),
  }),
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
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  nationality: z.string().optional().or(z.literal('')),
  idNumber: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  idDocumentUrl: z.string().optional().or(z.literal('')),
});

export const folioTransactionSchema = z.object({
  folioId: z.string().uuid(),
  type: z.enum(['CHARGE', 'PAYMENT', 'REFUND', 'DISCOUNT']),
  category: z.enum(['ROOM_CHARGE', 'SERVICE', 'TAX', 'DISCOUNT', 'PAYMENT', 'REFUND']),
  description: z.string().min(1),
  amount: z.number(),
  createdById: z.string().uuid().optional(),
});

export const createRatePlanSchema = z.object({
  roomTypeId: z.string().uuid(),
  name: z.string().min(2),
  nameAr: z.string().optional(),
  nightlyRate: z.number().positive(),
  startDate: z.string(),
  endDate: z.string(),
  minStay: z.number().int().positive().default(1),
  maxAdults: z.number().int().positive().default(2),
  maxChildren: z.number().int().min(0).default(0),
  extraBedPrice: z.number().positive().optional(),
  applyDays: z.string().optional(),
  cancellationPolicyId: z.string().uuid().optional(),
});

export const createCancellationPolicySchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  rules: z.string().min(1),
});

export const createHousekeepingSchema = z.object({
  roomId: z.string().uuid(),
  taskType: z.string().min(1, 'نوع المهمة مطلوب'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

export const updateHousekeepingSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
  taskType: z.string().min(1).optional(),
});

export const updateRoomStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'DIRTY']).optional(),
  housekeepingStatus: z.enum(['CLEAN', 'DIRTY', 'IN_PROGRESS', 'INSPECTED']).optional(),
});

export const createTaskTypeSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateTaskTypeSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const createMenuCategorySchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const createMenuItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  price: z.number().positive(),
  image: z.string().optional(),
});

export const createRestaurantOrderSchema = z.object({
  bookingId: z.string().uuid().optional(),
  orderType: z.enum(['DINE_IN', 'ROOM_SERVICE', 'TAKEAWAY']).default('DINE_IN'),
  tableNo: z.string().optional(),
  roomNo: z.string().optional(),
  guestName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      quantity: z.number().int().positive().default(1),
      notes: z.string().optional(),
    })
  ).min(1),
});

export const updateRestaurantOrderSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
});

export const createSafeDepositSchema = z.object({
  roomId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  externalClientId: z.string().uuid().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1, 'وصف العنصر مطلوب'),
      quantity: z.number().int().positive().default(1),
      notes: z.string().optional(),
    })
  ).optional(),
}).refine(
  (data) => {
    const hasBooking = !!data.bookingId;
    const hasExternal = !!data.externalClientId;
    return hasBooking !== hasExternal;
  },
  { message: 'يجب تحديد إما الحجز أو العميل الخارجي، وليس كليهما' }
);

export const addSafeDepositItemSchema = z.object({
  description: z.string().min(1, 'وصف العنصر مطلوب'),
  quantity: z.number().int().positive().default(1),
  notes: z.string().optional(),
});

export const closeSafeDepositSchema = z.object({
  notes: z.string().optional(),
});

export const createLostItemSchema = z.object({
  description: z.string().min(1, 'وصف الغرض مطلوب'),
  locationFound: z.string().min(1, 'مكان العثور مطلوب'),
  roomId: z.string().uuid().optional(),
  imageUrl: z.string().url('رابط الصورة غير صالح').optional(),
  notes: z.string().optional(),
});

export const updateLostItemSchema = z.object({
  status: z.enum(['PENDING', 'CLAIMED', 'DISPOSED']).optional(),
  claimedByName: z.string().optional(),
  claimedByIdNumber: z.string().optional(),
  imageUrl: z.string().url('رابط الصورة غير صالح').optional(),
  notes: z.string().optional(),
});

export const reportSettingsSchema = z.object({
  logoUrl: z.string().url('رابط الشعار غير صالح').optional().nullable(),
  headerText: z.string().optional().nullable(),
  footerText: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
});

export const websiteSettingsSchema = z.object({
  isOnlineBookingEnabled: z.boolean().optional(),
  taxRate: z.number().min(0, 'لا يمكن أن تكون الضريبة سالبة').max(100, 'الضريبة لا تتجاوز 100%').optional(),
  bookingFee: z.number().min(0, 'لا يمكن أن تكون رسوم الحجز سالبة').optional(),
  discountPercent: z.number().min(0, 'لا يمكن أن يكون الخصم سالبًا').max(100, 'الخصم لا يتجاوز 100%').optional(),
  confirmationCutoffHours: z.number().int('عدد ساعات صحيح').min(1, 'ساعة واحدة على الأقل').max(720, 'لا تتجاوز 30 يومًا').optional(),
});

export const reportExportSchema = z.object({
  type: z.enum(['occupancy', 'revenue', 'housekeeping', 'restaurant', 'safe-deposit', 'lost-found']),
  format: z.enum(['json', 'csv', 'print']).default('json'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const reportShareSchema = z.object({
  type: z.enum(['occupancy', 'revenue', 'housekeeping', 'restaurant', 'safe-deposit', 'lost-found']),
  format: z.enum(['json', 'csv', 'print']).default('print'),
  emails: z.array(z.string().email('البريد الإلكتروني غير صالح')).min(1, 'يجب إدخال بريد إلكتروني واحد على الأقل'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  message: z.string().optional(),
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
