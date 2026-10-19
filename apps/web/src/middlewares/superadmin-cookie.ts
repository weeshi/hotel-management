import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Cookie-based gate for the Bull Board dashboard.
 * The board is a browser SPA that cannot send `Authorization: Bearer`,
 * so we read the httpOnly `accessToken` cookie and require SUPER_ADMIN.
 */
export async function requireSuperAdminCookie(
  request: NextRequest
): Promise<NextResponse | null> {
  const token = getCookieValue(request.headers.get('cookie'), 'accessToken');
  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: 'يرجى تسجيل الدخول أولاً' } },
      { status: 401 }
    );
  }

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'جلسة غير صالحة' } },
      { status: 401 }
    );
  }

  if (payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { success: false, error: { message: 'غير مصرح' } },
      { status: 403 }
    );
  }

  // Must be a 2FA-verified session (`tv`), not a first-factor-only login.
  if (payload.tv !== true) {
    return NextResponse.json(
      { success: false, error: { message: 'مطلوب تحقق ثنائي للوصول' } },
      { status: 403 }
    );
  }

  return null;
}