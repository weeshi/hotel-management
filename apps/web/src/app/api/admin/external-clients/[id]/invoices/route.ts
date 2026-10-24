import {
  CorporateBillingService,
  generateStatementBodySchema,
} from '@/lib/services/corporate-billing.service';
import { withAuth, type AuthenticatedRequest } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { AppError } from '@/lib/utils/errors';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const corporateBillingService = new CorporateBillingService();

async function getHandler(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const hotelId = request.user?.hotelId;
    if (!hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);

    const statement = await corporateBillingService.getClientStatement(hotelId, params.id);
    return successResponse(statement);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'فشل جلب كشف حساب العميل';
    const status = error instanceof AppError ? error.statusCode : 400;
    return errorResponse(message, status);
  }
}

async function postHandler(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const hotelId = request.user?.hotelId;
    if (!hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);

    const parsed = generateStatementBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'بيانات الفاتورة غير صالحة', 422);
    }

    const invoice = await corporateBillingService.generateMonthlyStatement({
      hotelId,
      externalClientId: params.id,
      userId: request.user?.userId,
      ...parsed.data,
    });

    return successResponse(invoice, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'فشل إصدار الفاتورة المؤسسية';
    const status = error instanceof AppError ? error.statusCode : 400;
    return errorResponse(message, status);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'RECEPTION']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
