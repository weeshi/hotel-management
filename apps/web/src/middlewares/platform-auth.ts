import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { UnauthorizedError, ForbiddenError } from '@/lib/utils/errors';
import { runWithTenant } from '@/lib/tenant/runtime-context';

/**
 * Platform-gate for `/api/superadmin/*` (docs/SUPER-ADMIN-ARCH.md §4.2 layer 3).
 *
 * Accepts the `Authorization: Bearer` header OR the httpOnly `accessToken`
 * cookie (same session used by page-route Middleware), then requires:
 *   role === 'SUPER_ADMIN'  AND  tv === true        (2FA-verified session)
 *
 * A SUPER_ADMIN whose session did NOT pass the OTP gate (tv missing) is
 * rejected with 403 — password alone never grants platform API access.
 */
export function withPlatformAuth(handler: Function) {
  return async (request: NextRequest, context: any) => {
    try {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : request.cookies.get('accessToken')?.value;

      if (!token) {
        throw new UnauthorizedError('يرجى تسجيل الدخول أولاً');
      }

      const payload = await verifyAccessToken(token);

      if (payload.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError();
      }
      if (payload.tv !== true) {
        throw new ForbiddenError('مطلوب تحقق ثنائي للوصول إلى لوحة المنصة');
      }

      (request as any).user = {
        userId: payload.userId,
        role: payload.role,
        hotelId: payload.hotelId,
        tv: payload.tv,
      };

      // M8 — Super-Admin requests run as app_platform (BYPASSRLS): platform
      // identity is cross-tenant by design; RLS must never filter it.
      return runWithTenant({ mode: 'PLATFORM' }, () => handler(request, context));
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message:
              error instanceof UnauthorizedError || error instanceof ForbiddenError
                ? error.message
                : 'حدث خطأ في التحقق من الهوية',
            code: error instanceof UnauthorizedError || error instanceof ForbiddenError ? error.code : 'UNAUTHORIZED',
          },
        },
        {
          status: error instanceof UnauthorizedError || error instanceof ForbiddenError ? error.statusCode : 401,
        }
      );
    }
  };
}