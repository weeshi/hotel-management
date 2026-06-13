import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { hashPassword } from '@/lib/utils/password';
import { registerSchema } from '@hotel/shared';
import { errorResponse } from '@/lib/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: validated.email },
    });
    if (existing) {
      return errorResponse('البريد الإلكتروني مسجل مسبقاً', 409);
    }

    const hashedPassword = await hashPassword(validated.password);

    const user = await prisma.user.create({
      data: {
        email: validated.email,
        password: hashedPassword,
        name: validated.name,
        phone: validated.phone,
        role: 'RECEPTION',
        hotelId: 'default-hotel',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse('بيانات غير صالحة', 422);
    }
    return errorResponse(error.message || 'فشل إنشاء الحساب', 400);
  }
}
