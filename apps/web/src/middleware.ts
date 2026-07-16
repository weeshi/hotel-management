import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';

const RESTRICTED_PREFIXES = ['/admin', '/reception', '/manager'];
const BLOCKED_ROLES = ['HOUSEKEEPING', 'MAINTENANCE'];
const ALLOWED_REDIRECT = '/access-denied';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!RESTRICTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('accessToken')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    const payload = await verifyAccessToken(token);
    if (BLOCKED_ROLES.includes(payload.role)) {
      return NextResponse.redirect(new URL(ALLOWED_REDIRECT, request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
