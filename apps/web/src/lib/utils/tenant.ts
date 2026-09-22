import { prismaPlatform } from '@/lib/utils/prisma';

// --- Hostname Normalization ---

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split('/')[0].split('?')[0];
  host = host.replace(/:\d+$/, '');
  host = host.replace(/\.$/, '');
  return host || null;
}

// --- Host Resolution ---
// The hostname is NEVER a data-authority. Data access is granted exclusively
// through the `hotelId` inside the JWT. The host is only used to restrict the
// login surface and for branding. `x-forwarded-host` is trusted ONLY when the
// request provably passed through Cloudflare (presence of `cf-ray`), or when
// the operator explicitly opts in via TRUST_PROXY=true. In all other cases the
// raw `host` header is the only source of truth, so a spoofed forwarded header
// from an unproxied client is never trusted.

export function getEffectiveHost(request: Request): string | null {
  const urlHost = new URL(request.url).hostname;
  const host = request.headers.get('host') || urlHost;
  const isProxied = request.headers.has('cf-ray');
  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (isProxied || trustProxy) {
    const forwarded = request.headers.get('x-forwarded-host');
    const normalizedForwarded = normalizeDomain(forwarded);
    if (normalizedForwarded) return normalizedForwarded;
  }

  return normalizeDomain(host);
}

// --- Tenant Resolution (Node runtime only — uses Prisma) ---

export async function resolveTenantFromRequest(request: Request) {
  const host = getEffectiveHost(request);
  if (!host) return null;

  // Development fallback: if no customDomain matches and host is localhost/127.0.0.1,
  // fall back to the default hotel (allows local testing without DNS setup)
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const isDev = process.env.NODE_ENV !== 'production';

  const hotel = await prismaPlatform.hotel.findUnique({
    where: { customDomain: host },
    select: { id: true, name: true },
  });

  if (hotel) return hotel;

  if (isLocalhost && isDev) {
    return prismaPlatform.hotel.findFirst({
      where: { id: 'default-hotel' },
      select: { id: true, name: true },
    });
  }

  return null;
}

