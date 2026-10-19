import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import { verifyAccessToken, verifyRefreshToken } from '@/lib/utils/jwt';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { withCsrf } from '@/middlewares/csrf';

const authService = new AuthService();

const OTP_COOKIE = 'sa_otp';
// Path `/` — must clear the cookie exactly where the login/verify/resend
// routes set it (SA.5).
const OTP_COOKIE_PATH = '/';

function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.set('accessToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/api/auth',
  });
  response.cookies.set(OTP_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: OTP_COOKIE_PATH,
  });
  return response;
}

/**
 * POST /api/superadmin/auth/logout — revokes the Super-Admin session and clears
 * every auth cookie (access + refresh + any pending OTP challenge).
 *
 * Best-effort by design: the refresh token is revoked server-side from the DB
 * when identifiable (cookies are the only carried identity; if they are already
 * gone the clear is still harmless), and the audit is recorded without an actor
 * when the token no longer resolves. See docs/SUPER-ADMIN-ARCH.md §12.
 */
async function handler(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const accessCookie = request.cookies.get('accessToken')?.value;
    const refreshCookie = request.cookies.get('refreshToken')?.value;

    let userId: string | undefined;
    let family: string | undefined;

    try {
      if (accessCookie) {
        const payload = await verifyAccessToken(accessCookie);
        userId = payload.userId;
      }
    } catch {
      /* stale access token — refresh/clear still proceeds */
    }

    try {
      if (refreshCookie) {
        const payload = await verifyRefreshToken(refreshCookie);
        family = payload.family;
        if (!userId) userId = payload.userId;
      }
    } catch {
      /* stale refresh token — clear still proceeds */
    }

    if (userId) {
      try {
        await authService.logout(userId, family);
      } catch {
        /* revocation failure must not block cookie clearing */
      }
    }

    await recordPlatformAudit({
      actorUserId: userId,
      action: 'SUPER_ADMIN_LOGOUT',
      entity: 'SUPER_ADMIN_AUTH',
      ip,
      userAgent,
    });

    const response = successResponse({ revoked: true });
    return clearSessionCookies(response);
  } catch (error: any) {
    return errorResponse(
      error.message || 'فشل تسجيل الخروج',
      error.statusCode || 400,
      error.code
    );
  }
}

export const POST = withCsrf(handler);