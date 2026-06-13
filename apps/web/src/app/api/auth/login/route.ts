import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { loginSchema } from '@hotel/shared';
import { errorResponse } from '@/lib/utils/api-response';

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

    return response;
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse('بيانات غير صالحة', 422);
    }
    return errorResponse(error.message || 'فشل تسجيل الدخول', error.statusCode || 400);
  }
}
