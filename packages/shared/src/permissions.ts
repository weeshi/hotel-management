import { Role } from './enums';

export const Permissions = {
  ROOMS_READ: 'rooms:read',
  ROOMS_WRITE: 'rooms:write',
  BOOKINGS_READ: 'bookings:read',
  BOOKINGS_WRITE: 'bookings:write',
  BOOKINGS_CANCEL: 'bookings:cancel',
  BOOKINGS_CHECKIN: 'bookings:checkin',
  BOOKINGS_CHECKOUT: 'bookings:checkout',
  HOUSEKEEPING_READ: 'housekeeping:read',
  HOUSEKEEPING_WRITE: 'housekeeping:write',
  MAINTENANCE_READ: 'maintenance:read',
  MAINTENANCE_WRITE: 'maintenance:write',
  SERVICES_READ: 'services:read',
  SERVICES_WRITE: 'services:write',
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_WRITE: 'payments:write',
  FOLIO_READ: 'folio:read',
  FOLIO_WRITE: 'folio:write',
  FOLIO_DISCOUNT: 'folio:discount',
  REPORTS_READ: 'reports:read',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  SETTINGS_WRITE: 'settings:write',
  MENU_READ: 'menu:read',
  MENU_WRITE: 'menu:write',
  RESTAURANT_ORDERS_READ: 'restaurant-orders:read',
  RESTAURANT_ORDERS_WRITE: 'restaurant-orders:write',
  UPLOADS: 'uploads:write',
  AUDIT_LOGS_READ: 'audit-logs:read',
  RATE_PLANS_READ: 'rate-plans:read',
  RATE_PLANS_WRITE: 'rate-plans:write',
  SAFE_DEPOSIT_READ: 'safe-deposit:read',
  SAFE_DEPOSIT_WRITE: 'safe-deposit:write',
  SAFE_DEPOSIT_CLOSE: 'safe-deposit:close',
  LOST_FOUND_READ: 'lost-found:read',
  LOST_FOUND_WRITE: 'lost-found:write',
  LOST_FOUND_CLAIM: 'lost-found:claim',
  LOST_FOUND_DISPOSE: 'lost-found:dispose',
  REPORTS_EXPORT: 'reports:export',
  REPORTS_SHARE: 'reports:share',
  REPORTS_SETTINGS: 'reports:settings',
} as const;

const rolePermissions: Record<Role, string[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permissions),

  [Role.ADMIN]: Object.values(Permissions),

  [Role.MANAGER]: [
    Permissions.ROOMS_READ, Permissions.ROOMS_WRITE,
    Permissions.BOOKINGS_READ, Permissions.BOOKINGS_WRITE, Permissions.BOOKINGS_CANCEL,
    Permissions.BOOKINGS_CHECKIN, Permissions.BOOKINGS_CHECKOUT,
    Permissions.HOUSEKEEPING_READ, Permissions.HOUSEKEEPING_WRITE,
    Permissions.MAINTENANCE_READ, Permissions.MAINTENANCE_WRITE,
    Permissions.SERVICES_READ, Permissions.SERVICES_WRITE,
    Permissions.PAYMENTS_READ, Permissions.PAYMENTS_WRITE,
    Permissions.FOLIO_READ, Permissions.FOLIO_WRITE,
    Permissions.REPORTS_READ,
    Permissions.USERS_READ,
    Permissions.MENU_READ, Permissions.MENU_WRITE,
    Permissions.RESTAURANT_ORDERS_READ, Permissions.RESTAURANT_ORDERS_WRITE,
    Permissions.UPLOADS,
    Permissions.AUDIT_LOGS_READ,
    Permissions.RATE_PLANS_READ, Permissions.RATE_PLANS_WRITE,
    Permissions.SAFE_DEPOSIT_READ, Permissions.SAFE_DEPOSIT_WRITE, Permissions.SAFE_DEPOSIT_CLOSE,
    Permissions.LOST_FOUND_READ, Permissions.LOST_FOUND_WRITE, Permissions.LOST_FOUND_CLAIM, Permissions.LOST_FOUND_DISPOSE,
    Permissions.REPORTS_EXPORT, Permissions.REPORTS_SHARE, Permissions.REPORTS_SETTINGS,
  ],

  [Role.RECEPTION]: [
    Permissions.ROOMS_READ,
    Permissions.BOOKINGS_READ, Permissions.BOOKINGS_WRITE, Permissions.BOOKINGS_CANCEL,
    Permissions.BOOKINGS_CHECKIN, Permissions.BOOKINGS_CHECKOUT,
    Permissions.HOUSEKEEPING_READ, Permissions.HOUSEKEEPING_WRITE,
    Permissions.MAINTENANCE_READ, Permissions.MAINTENANCE_WRITE,
    Permissions.SERVICES_READ,
    Permissions.PAYMENTS_READ, Permissions.PAYMENTS_WRITE,
    Permissions.FOLIO_READ, Permissions.FOLIO_WRITE,
    Permissions.MENU_READ,
    Permissions.RESTAURANT_ORDERS_READ, Permissions.RESTAURANT_ORDERS_WRITE,
    Permissions.UPLOADS,
    Permissions.SAFE_DEPOSIT_READ, Permissions.SAFE_DEPOSIT_WRITE,
    Permissions.LOST_FOUND_READ, Permissions.LOST_FOUND_WRITE, Permissions.LOST_FOUND_CLAIM,
  ],

  [Role.HOUSEKEEPING]: [
    Permissions.ROOMS_READ,
    Permissions.HOUSEKEEPING_READ, Permissions.HOUSEKEEPING_WRITE,
    Permissions.LOST_FOUND_READ, Permissions.LOST_FOUND_WRITE,
  ],

  [Role.MAINTENANCE]: [
    Permissions.ROOMS_READ,
    Permissions.MAINTENANCE_READ, Permissions.MAINTENANCE_WRITE,
    Permissions.LOST_FOUND_READ,
  ],

  [Role.RESTAURANT]: [
    Permissions.ROOMS_READ,
    Permissions.BOOKINGS_READ,
    Permissions.FOLIO_READ,
    Permissions.MENU_READ,
    Permissions.RESTAURANT_ORDERS_READ, Permissions.RESTAURANT_ORDERS_WRITE,
    Permissions.UPLOADS,
    Permissions.LOST_FOUND_READ,
  ],

  [Role.ACCOUNTANT]: [
    Permissions.BOOKINGS_READ,
    Permissions.FOLIO_READ,
    Permissions.PAYMENTS_READ,
    Permissions.REPORTS_READ,
    Permissions.SERVICES_READ,
    Permissions.SAFE_DEPOSIT_READ,
    Permissions.LOST_FOUND_READ,
    Permissions.REPORTS_EXPORT,
  ],
};

export function hasPermission(userRole: string, permission: string): boolean {
  const perms = rolePermissions[userRole as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function hasRole(userRole: string, allowed: (Role | string)[]): boolean {
  return allowed.includes(userRole as Role);
}

export function getRoleLabel(role: Role, locale: 'ar' | 'en' = 'ar'): string {
  const labels: Record<Role, { ar: string; en: string }> = {
    [Role.SUPER_ADMIN]: { ar: 'مشرف النظام', en: 'Super Admin' },
    [Role.ADMIN]: { ar: 'مدير النظام', en: 'Admin' },
    [Role.MANAGER]: { ar: 'مدير', en: 'Manager' },
    [Role.RECEPTION]: { ar: 'استقبال', en: 'Reception' },
    [Role.HOUSEKEEPING]: { ar: 'تدبير منزلي', en: 'Housekeeping' },
    [Role.MAINTENANCE]: { ar: 'صيانة', en: 'Maintenance' },
    [Role.RESTAURANT]: { ar: 'مطعم', en: 'Restaurant' },
    [Role.ACCOUNTANT]: { ar: 'محاسب', en: 'Accountant' },
  };
  return labels[role]?.[locale] || role;
}
