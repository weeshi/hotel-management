import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { loginSchema } from '@hotel/shared';
import { errorResponse } from '@/lib/utils/api-response';
import { ZodError } from 'zod';
import { resolveTenantFromRequest } from '@/lib/utils/tenant';

const authService = new AuthService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);

    // When the request host matches a hotel customDomain, the login is locked
    // to that tenant so only that hotel's users can authenticate there.
    const tenant = await resolveTenantFromRequest(request);
    const result = await authService.login(
      validated.email,
      validated.password,
      tenant?.id
    );

    const response = NextResponse.json({
      success: true,
      data: result,
    });

    // Set refresh token as HttpOnly cookie
    response.cookies.set('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/auth',
    });

    // Set access token cookie for middleware (page-route protection)
    response.cookies.set('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    if (error instanceof ZodError) {
      return errorResponse(error.errors.map(e => e.message).join('، '), 422);
    }
    return errorResponse(error.message || 'فشل تسجيل الدخول', error.statusCode || 400);
  }
}
