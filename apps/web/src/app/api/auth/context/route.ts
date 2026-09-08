import { NextRequest } from 'next/server';
import { withRateLimit } from '@/middlewares/rate-limit';
import { successResponse } from '@/lib/utils/api-response';
import { resolveTenantFromRequest } from '@/lib/utils/tenant';

// Public pre-auth context: exposes only the branding-relevant tenant identity
// (hotelId + hotelName) resolved from the request host. Never exposes secrets.
// Unknown hosts resolve to a generic SaaS context (nulls).
async function getHandler(request: NextRequest) {
  const tenant = await resolveTenantFromRequest(request);

  return successResponse({
    hotelId: tenant?.id ?? null,
    hotelName: tenant?.name ?? null,
  });
}

export const GET = withRateLimit(getHandler, 60);
