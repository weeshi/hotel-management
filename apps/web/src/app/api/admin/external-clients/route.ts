import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

// --- GET: List external clients for dropdown ---

async function listHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const clients = await prisma.externalClient.findMany({
      where: { hotelId: user.hotelId },
      select: { id: true, name: true, phone: true },
      orderBy: { createdAt: 'desc' },
    });
    return successResponse(clients);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب العملاء الخارجيين');
  }
}

// --- POST: Create external client ---

async function createHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.name?.trim()) {
      return errorResponse('اسم العميل مطلوب', 400);
    }

    const client = await prisma.externalClient.create({
      data: {
        hotelId: user.hotelId,
        name: body.name.trim(),
        phone: body.phone || null,
        idNumber: body.idNumber || null,
      },
    });

    return NextResponse.json({ success: true, data: client }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء العميل الخارجي');
  }
}

export const GET = withAuth(listHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(createHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
