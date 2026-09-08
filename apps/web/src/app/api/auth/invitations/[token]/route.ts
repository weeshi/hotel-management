import { NextRequest } from 'next/server';
import { InvitationService } from '@/lib/services/invitation.service';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const invitationService = new InvitationService();

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const invitation = await invitationService.validateToken(params.token);
    return successResponse(invitation);
  } catch (error: any) {
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      return errorResponse(error.message, error.statusCode || 400, error.code);
    }
    return errorResponse(error.message || 'فشل التحقق من الدعوة', 400);
  }
}
