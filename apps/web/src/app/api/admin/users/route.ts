import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { hashPassword } from '@/lib/utils/password';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const users = await prisma.user.findMany({
      where: { hotelId: user.hotelId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return successResponse(users);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ†');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      return errorResponse('ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظ…ط³طھط®ط¯ظ… ظ…ط³ط¨ظ‚ط§ظ‹', 409);
    }

    const hashedPassword = await hashPassword(body.password);

    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        name: body.name,
        role: body.role || 'RECEPTION',
        hotelId: user.hotelId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'USER',
      entityId: newUser.id,
      newValue: JSON.stringify({ email: newUser.email, name: newUser.name, role: newUser.role }),
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط³طھط®ط¯ظ…');
  }
}

export const GET = withAuth(getHandler, ['ADMIN']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN']);
