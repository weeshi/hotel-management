import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { UnauthorizedError, ForbiddenError } from '@/lib/utils/errors';
import { Role, hasRole } from '@hotel/shared';
import { runWithTenant } from '@/lib/tenant/runtime-context';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: string;
    role: string;
    hotelId?: string;
  };
}

export function withAuth(handler: Function, allowedRoles?: (Role | string)[]) {
  return async (request: AuthenticatedRequest, context: any) => {
    try {
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('يرجى تسجيل الدخول أولاً');
      }

      const token = authHeader.substring(7);
      const payload = await verifyAccessToken(token);

      (request as any).user = {
        userId: payload.userId,
        role: payload.role,
        hotelId: payload.hotelId,
      };

      if (allowedRoles && !hasRole(payload.role, allowedRoles)) {
        throw new ForbiddenError();
      }

      // M8 — the whole request runs as app_tenant scoped to the JWT's hotel.
      // If the token carries no hotel (e.g. a global session), fail closed:
      // authenticated-but-untenanted requests get NO tenant data access.
      if (!payload.hotelId) {
        throw new UnauthorizedError('جلسة غير مرتبطة بفندق');
      }

      return runWithTenant(
        { mode: 'TENANT', hotelId: payload.hotelId },
        () => handler(request, context)
      );
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
        return NextResponse.json(
          { success: false, error: { message: error.message, code: error.code } },
          { status: error.statusCode }
        );
      }

      return NextResponse.json(
        { success: false, error: { message: 'حدث خطأ في التحقق من الهوية' } },
        { status: 401 }
      );
    }
  };
}

export function getUserId(request: AuthenticatedRequest): string {
  if (!(request as any).user) throw new UnauthorizedError();
  return (request as any).user.userId;
}

export function getUserRole(request: AuthenticatedRequest): string {
  if (!(request as any).user) throw new UnauthorizedError();
  return (request as any).user.role;
}
