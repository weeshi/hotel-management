import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { getEffectiveHost } from '@/lib/utils/tenant';

const RESTRICTED_PREFIXES = ['/admin', '/reception', '/manager', '/superadmin'];
const BLOCKED_ROLES = ['HOUSEKEEPING', 'MAINTENANCE'];
const ALLOWED_REDIRECT = '/access-denied';

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
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    const payload = await verifyAccessToken(token);
    if (BLOCKED_ROLES.includes(payload.role)) {
      return NextResponse.redirect(new URL(ALLOWED_REDIRECT, request.url));
    }
    // `/superadmin` and `/admin/queues` (Bull Board) are reserved for the
    // platform owner AND require a session that passed the Email-OTP gate
    // (`tv: true`, see docs/SUPER-ADMIN-ARCH.md §4.3). A first-factor-only
    // session is sent back to login to complete 2FA.
    if (pathname.startsWith('/superadmin') || pathname.startsWith('/admin/queues')) {
      if (payload.role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL(ALLOWED_REDIRECT, request.url));
      }
      if (payload.tv !== true) {
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }
    }
  } catch {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return withTenantHost(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
