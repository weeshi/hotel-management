import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { getEffectiveHost } from '@/lib/utils/tenant';

const RESTRICTED_PREFIXES = ['/admin', '/reception', '/manager', '/superadmin'];
const BLOCKED_ROLES = ['HOUSEKEEPING', 'MAINTENANCE'];
const ALLOWED_REDIRECT = '/access-denied';
const SUPERADMIN_LOGIN = '/superadmin/login';

// Pre-auth screens of the Super-Admin 2FA flow (SA.5). These are public entry
// points: the OTP page itself re-verifies the `sa_otp` challenge cookie with a
// Server-Component guard, so nothing must gate them here.
const SUPERADMIN_PUBLIC_PATHS = ['/superadmin/login', '/superadmin/otp'];

// Injects the normalized effective host as `x-tenant-host` so page routes can
// derive tenant context without a DB lookup in the Edge runtime.
function withTenantHost(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  const effectiveHost = getEffectiveHost(request);
  if (effectiveHost) headers.set('x-tenant-host', effectiveHost);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!RESTRICTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return withTenantHost(request);
  }

  const token = request.cookies.get('accessToken')?.value;

  // Public Super-Admin pre-auth screens. If a fully-verified session already
  // exists they are skipped forward; otherwise the page renders and its own
  // server-side guard (OTP challenge cookie) decides.
  if (SUPERADMIN_PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (token) {
      try {
        const payload = await verifyAccessToken(token);
        if (payload.role === 'SUPER_ADMIN' && payload.tv === true) {
          return NextResponse.redirect(new URL('/superadmin', request.url));
        }
      } catch {
        /* stale token — let the page render */
      }
    }
    return withTenantHost(request);
  }

  if (!token) {
    const target = pathname.startsWith('/superadmin') ? SUPERADMIN_LOGIN : '/auth/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  try {
    const payload = await verifyAccessToken(token);
    if (BLOCKED_ROLES.includes(payload.role)) {
      return NextResponse.redirect(new URL(ALLOWED_REDIRECT, request.url));
    }
    // `/superadmin` (including the Bull Board at `/superadmin/jobs`) is reserved
    // for the platform owner AND requires a session that passed the Email-OTP
    // gate (`tv: true`, see docs/SUPER-ADMIN-ARCH.md §4.3). A first-factor-only
    // session is sent to the dedicated OTP flow, not the legacy `/auth/login`.
    if (pathname.startsWith('/superadmin')) {
      if (payload.role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL(ALLOWED_REDIRECT, request.url));
      }
      if (payload.tv !== true) {
        return NextResponse.redirect(new URL(SUPERADMIN_LOGIN, request.url));
      }
    }
  } catch {
    const target = pathname.startsWith('/superadmin') ? SUPERADMIN_LOGIN : '/auth/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return withTenantHost(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};