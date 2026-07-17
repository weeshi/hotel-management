import { NextRequest } from 'next/server';
import { RestaurantOrderService } from '@/lib/services/restaurant-order.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';

const restaurantOrderService = new RestaurantOrderService();

const VALID_METHODS = ['WALLET', 'CASH', 'POS'];

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.method || !VALID_METHODS.includes(body.method)) {
      return errorResponse('طريقة الدفع غير صالحة. الطرق المتاحة: WALLET, CASH, POS', 400);
    }

    const order = await restaurantOrderService.settleOrder(params.id, {
      method: body.method,
      userId: user.userId,
      userRole: user.role,
      hotelId: user.hotelId,
    });

    return successResponse(order, 200);
  } catch (error: any) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse(error.message || 'فشل تسوية الطلب', 400);
  }
}

export const POST = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
