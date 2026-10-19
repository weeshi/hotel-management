import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { normalizeVCCWebhook, isValidVCCProvider, NormalizedVCCBooking } from '@/lib/integrations/vcc-normalizer';
import { processNormalizedVCCBooking } from '@/workers/jobs/processInboundBooking.job';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

const VGS_SIGNATURE_HEADER = 'vgs-signature'; // VGS sends this header
const VGS_WEBHOOK_SECRET = process.env.VGS_WEBHOOK_SECRET || 'dev-secret-change-in-production';

/**
 * Verifies VGS webhook signature (HMAC-SHA256)
 * In production, VGS signs the payload with your webhook secret.
 * See: https://www.verygoodsecurity.com/docs/secure-forms/webhooks
 */
async function verifyVGSSignature(payload: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;

  const crypto = await import('crypto');
  const expected = crypto
    .createHmac('sha256', VGS_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  // Validate provider
  if (!isValidVCCProvider(provider)) {
    return errorResponse(`مزود غير مدعوم: ${provider}`, 400);
  }

  // Get raw body for signature verification
  const rawBody = await request.text();
  const signature = headers().get(VGS_SIGNATURE_HEADER);

  // Verify VGS signature (skip in development if no secret)
  if (process.env.NODE_ENV === 'production' && VGS_WEBHOOK_SECRET !== 'dev-secret-change-in-production') {
    const valid = await verifyVGSSignature(rawBody, signature);
    if (!valid) {
      console.warn('[VGS Webhook] Invalid signature', { provider });
      return errorResponse('توقيع VGS غير صالح', 401);
    }
  }

  // Parse JSON
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('JSON غير صالح', 400);
  }

  console.log(`[VGS Webhook] Received ${provider} booking`, { externalRef: body?.externalRef || body?.reservation_number });

  // Normalize via factory
  let normalized: NormalizedVCCBooking;
  try {
    normalized = normalizeVCCWebhook(provider, body);
  } catch (err: any) {
    console.error(`[VGS Webhook] Normalization failed for ${provider}:`, err.message);
    return errorResponse(`فشل تطبيع البيانات: ${err.message}`, 400);
  }

  // Extract hotelId from the payload (VGS adds hotel context or we infer from mapping)
  // In real impl, hotelId comes from VGS proxy context or subdomain
  const hotelId = body.hotel_id || body.hotelId || body.hotel_id;
  if (!hotelId) {
    // Try to resolve from channel mapping
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
      return errorResponse('لا يمكن تحديد الفندق', 400);
    }
    normalized.hotelId = mapping.hotelId;
  } else {
    normalized.hotelId = hotelId;
  }

  // hotelId is guaranteed to be set at this point
  if (!normalized.hotelId) {
    return errorResponse('لا يمكن تحديد الفندق', 400);
  }

  // Process the normalized VCC booking
  const result = await processNormalizedVCCBooking(normalized.hotelId, provider, normalized);

  if (result.ok) {
    return successResponse({
      received: true,
      bookingNo: result.bookingNo,
      duplicate: result.duplicate,
    }, result.status || 201);
  }

  return errorResponse(result.error || 'فشل معالجة الحجز', result.status || 500);
}