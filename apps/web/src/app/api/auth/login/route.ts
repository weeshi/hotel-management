import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { loginSchema } from '@hotel/shared';
import { errorResponse } from '@/lib/utils/api-response';
import { ZodError } from 'zod';

const authService = new AuthService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);

    const result = await authService.login(validated.email, validated.password);

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
      return errorResponse(error.errors.map(e => e.message).join('طŒ '), 422);
    }
    return errorResponse(error.message || 'ظپط´ظ„ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„', error.statusCode || 400);
  }
}
