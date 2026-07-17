import { NextRequest } from 'next/server';
import { PaymentService } from '@/lib/services/payment.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

const paymentService = new PaymentService();

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.amount || typeof body.amount !== 'number') {
      return errorResponse('المبلغ مطلوب', 400);
    }

    const refund = await paymentService.processRefund(params.id, {
      amount: body.amount,
      reason: body.reason,
      createdById: user.userId,
      userRole: user.role,
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'REFUND',
      entity: 'PAYMENT',
      entityId: params.id,
      newValue: JSON.stringify({ amount: body.amount, reason: body.reason }),
    });

    return successResponse(refund, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الاسترداد', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(withRateLimit(postHandler)), ['ADMIN', 'MANAGER']);
