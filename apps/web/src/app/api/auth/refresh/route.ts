import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { errorResponse } from '@/lib/utils/api-response';

const authService = new AuthService();

export async function POST(request: NextRequest) {
  try {
    const refreshToken =
      request.cookies.get('refreshToken')?.value ||
      (await request.json())?.refreshToken;

    if (!refreshToken) {
      return errorResponse('رمز التحديث مطلوب', 401);
    }

    const result = await authService.refreshTokens(refreshToken);

    const response = NextResponse.json({
      success: true,
      data: result,
    });

    response.cookies.set('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/auth',
    });

    return response;
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث التوكن', error.statusCode || 401);
  }
}
