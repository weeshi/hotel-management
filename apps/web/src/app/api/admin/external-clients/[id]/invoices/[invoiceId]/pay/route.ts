import {
  CorporateBillingService,
  recordPaymentBodySchema,
} from '@/lib/services/corporate-billing.service';
import { withAuth, type AuthenticatedRequest } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { AppError } from '@/lib/utils/errors';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const corporateBillingService = new CorporateBillingService();

async function postHandler(
  request: AuthenticatedRequest,
  { params }: { params: { id: string; invoiceId: string } },
) {
  try {
    const hotelId = request.user?.hotelId;
    if (!hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);

    const parsed = recordPaymentBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'بيانات الدفعة غير صالحة', 422);
    }

    const invoice = await corporateBillingService.recordInvoicePayment({
      hotelId,
      invoiceId: params.invoiceId,
      userId: request.user?.userId,
      ...parsed.data,
    });

    return successResponse(invoice);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'فشل تسجيل دفعة الفاتورة';
    const status = error instanceof AppError ? error.statusCode : 400;
    return errorResponse(message, status);
  }
}

export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
