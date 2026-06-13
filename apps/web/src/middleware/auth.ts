import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { UnauthorizedError, ForbiddenError } from '@/lib/utils/errors';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: string;
    role: string;
    hotelId?: string;
  };
}

type Role = 'ADMIN' | 'MANAGER' | 'RECEPTION' | 'GUEST';

export function withAuth(handler: Function, allowedRoles?: Role[]) {
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

      if (allowedRoles && !allowedRoles.includes(payload.role as Role)) {
        throw new ForbiddenError();
      }

      return handler(request, context);
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
