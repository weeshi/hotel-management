import { NextRequest } from 'next/server';
import { normalizeVCCWebhook, isValidVCCProvider, NormalizedVCCBooking } from '@/lib/integrations/vcc-normalizer';
import { processNormalizedVCCBooking } from '@/workers/jobs/processInboundBooking.job';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

/**
 * Development/Test endpoint that simulates VGS tokenization.
 * In production, VGS Proxy does the tokenization BEFORE the request reaches us.
 * This endpoint is for LOCAL DEVELOPMENT ONLY — simulates the VGS tokenization step.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isValidVCCProvider(provider)) {
    return errorResponse(`مزود غير مدعوم: ${provider}`, 400);
  }

  const body = await request.json();
  console.log(`[VGS Simulator] Raw ${provider} payload received`);

  // Simulate VGS tokenization: replace PAN/CVV/expiry with tokens
  const tokenizedBody = simulateVGSTokenization(provider, body);

  // Normalize via factory
  let normalized: NormalizedVCCBooking;
  try {
    normalized = normalizeVCCWebhook(provider, tokenizedBody);
  } catch (err: any) {
    console.error(`[VGS Simulator] Normalization failed:`, err.message);
    return errorResponse(`فشل تطبيع البيانات: ${err.message}`, 400);
  }

  // Resolve hotelId (same logic as production)
  let hotelId = body.hotel_id || body.hotelId;
  if (!hotelId) {
    const { prisma } = await import('@/lib/utils/prisma');
    const mapping = await prisma.channelMapping.findFirst({
      where: {
        provider: provider.toUpperCase() as any,
        channelRoomTypeId: normalized.channelRoomTypeId,
        enabled: true,
      },
      select: { hotelId: true },
    });
    if (!mapping) {
      return errorResponse('لا يمكن تحديد الفندق من الـ mapping', 400);
    }
    hotelId = mapping.hotelId;
  }
  normalized.hotelId = hotelId;

  // Process
  const result = await processNormalizedVCCBooking(hotelId, provider, normalized);

  if (result.ok) {
    return successResponse({
      received: true,
      bookingNo: result.bookingNo,
      duplicate: result.duplicate,
      simulated: true,
    }, result.status || 201);
  }

  return errorResponse(result.error || 'فشل معالجة الحجز', result.status || 500);
}

/**
 * Simulates VGS tokenization for local development.
 * Replaces sensitive fields with fake tokens.
 * In production, VGS Proxy does this BEFORE the request hits our API.
 */
function simulateVGSTokenization(provider: string, payload: any): any {
  const cloned = JSON.parse(JSON.stringify(payload));

  // Generate fake tokens that match the expected format
  const fakeToken = (prefix: string) => `tok_${prefix}_${Math.random().toString(36).substring(2, 15)}`;

  // Booking.com structure
  if (provider === 'booking.com') {
    const reservation = cloned.reservation || cloned.booking || cloned;
    if (reservation.payment) {
      const p = reservation.payment;
      if (p.card_number) p.card_number = fakeToken('visa');
      if (p.cvv) p.cvv = fakeToken('cvv');
      if (p.expiry_date) p.expiry_date = fakeToken('exp');
      if (p.holder_name) p.holder_name = p.holder_name || 'BOOKING.COM GUEST';
    }
    // Add VGS metadata
    reservation.vgs_metadata = {
      vault_id: 'vlt_dev_123',
      tokenized_at: new Date().toISOString(),
      proxy_version: 'dev-simulator',
    };
  }

  // Expedia structure
  if (provider === 'expedia') {
    const itinerary = cloned.itinerary || cloned.hotelConfirmation || cloned;
    if (itinerary.payment) {
      const p = itinerary.payment;
      if (p.card_number) p.card_number = fakeToken('visa');
      if (p.cvv) p.cvv = fakeToken('cvv');
      if (p.expiry_date) p.expiry_date = fakeToken('exp');
      if (p.holder_name) p.holder_name = p.holder_name || 'EXPEDIA GUEST';
    }
    itinerary.vgs_metadata = {
      vault_id: 'vlt_dev_123',
      tokenized_at: new Date().toISOString(),
      proxy_version: 'dev-simulator',
    };
  }

  // Generic structure
  if (cloned.payment) {
    const p = cloned.payment;
    if (p.card_number) p.card_number = fakeToken('visa');
    if (p.cvv) p.cvv = fakeToken('cvv');
    if (p.expiry_date) p.expiry_date = fakeToken('exp');
    if (p.holder_name) p.holder_name = p.holder_name || 'GUEST';
  }
  cloned.vgs_metadata = {
    vault_id: 'vlt_dev_123',
    tokenized_at: new Date().toISOString(),
    proxy_version: 'dev-simulator',
  };

  return cloned;
}