import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { hashPassword } from '@/lib/utils/password';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

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
    return errorResponse(error.message || 'فشل جلب المستخدمين');
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
      return errorResponse('البريد الإلكتروني مستخدم مسبقاً', 409);
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

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء المستخدم');
  }
}

export const GET = withAuth(getHandler, ['ADMIN']);
export const POST = withAuth(postHandler, ['ADMIN']);
