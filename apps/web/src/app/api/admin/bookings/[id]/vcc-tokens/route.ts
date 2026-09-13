import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = (request as any).user;
    const { id } = await params;

    // Fetch the booking with payment details including VCC tokens
    const booking = await prisma.booking.findFirst({
      where: { id, hotelId: user.hotelId },
      include: {
        folio: {
          include: {
            payments: {
              where: {
                method: 'VCC',
                vccToken: { not: null },
                folio: { booking: { hotelId: user.hotelId } },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!booking) return errorResponse('الحجز غير موجود', 404);

    const vccPayment = booking.folio?.payments?.[0];
    if (!vccPayment || !vccPayment.vccToken) {
      return errorResponse('لا توجد بيانات بطاقة افتراضية لهذا الحجز', 404);
    }

    // Log audit trail for VCC reveal in VCCAuditLog
    await prisma.vCCAuditLog.create({
      data: {
        hotelId: user.hotelId,
        paymentId: vccPayment.id,
        bookingId: booking.id,
        action: 'revealed',
        vccTokenRef: vccPayment.vccToken?.substring(0, 12) + '...',
        vgsVaultId: vccPayment.vgsVaultId,
        performedBy: user.userId,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: JSON.stringify({
          revealedBy: user.userId,
          revealedAt: new Date().toISOString(),
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        }),
      },
    });

    // Also create general audit log
    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'REVEAL',
      entity: 'VCC',
      entityId: vccPayment.id,
      newValue: JSON.stringify({
        bookingId: booking.id,
        vgsVaultId: vccPayment.vgsVaultId,
      }),
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // Return the VCC tokens (NOT the full PAN/CVV - only tokens for VGS Reveal)
    return successResponse({
      vccToken: vccPayment.vccToken,
      vccExpiryToken: vccPayment.vccExpiryToken,
      vccCVVToken: vccPayment.vccCVVToken,
      vccHolderName: vccPayment.vccHolderName,
      vgsVaultId: vccPayment.vgsVaultId,
      // Provide the VGS Reveal URL for the iframe
      revealUrl: `${process.env.VGS_REVEAL_DOMAIN || 'https://reveal.verygoodsecurity.com'}/v1/reveal?` +
        `tokens=${vccPayment.vccToken},${vccPayment.vccExpiryToken},${vccPayment.vccCVVToken}` +
        `&theme=light&timeout=60`,
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب بيانات البطاقة الافتراضية', 500);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);