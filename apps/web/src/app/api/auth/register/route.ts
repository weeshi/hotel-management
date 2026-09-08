import { NextRequest } from 'next/server';
import { InvitationService } from '@/lib/services/invitation.service';
import { acceptInvitationSchema } from '@hotel/shared';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const invitationService = new InvitationService();

async function postHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = acceptInvitationSchema.parse(body);

    const user = await invitationService.acceptInvitation({
      token: validated.token,
      name: validated.name,
      password: validated.password,
      phone: validated.phone,
    });

    return successResponse(user, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse('بيانات غير صالحة', 422);
    }
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      return errorResponse(error.message, error.statusCode || 400);
    }
    return errorResponse(error.message || 'فشل إنشاء الحساب', 400);
  }
}

export const POST = withRateLimit(postHandler, 20);
