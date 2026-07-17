import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

// --- GET: List packages for this hotel ---

async function listPackagesHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');

    const where: any = { hotelId: user.hotelId };
    if (isActive === 'true') where.isActive = true;

    const packages = await prisma.safeBoxPackage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(packages);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الباقات');
  }
}

// --- POST: Create a new package ---

async function createPackageHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const { name, dailyPrice, weeklyPrice, monthlyPrice } = body;

    if (!name?.trim()) {
      return errorResponse('اسم الباقة مطلوب');
    }
    if (dailyPrice == null || Number(dailyPrice) <= 0) {
      return errorResponse('السعر اليومي يجب أن يكون أكبر من صفر');
    }
    if (weeklyPrice == null || Number(weeklyPrice) <= 0) {
      return errorResponse('السعر الأسبوعي يجب أن يكون أكبر من صفر');
    }
    if (monthlyPrice == null || Number(monthlyPrice) <= 0) {
      return errorResponse('السعر الشهري يجب أن يكون أكبر من صفر');
    }

    const pkg = await prisma.safeBoxPackage.create({
      data: {
        hotelId: user.hotelId,
        name: name.trim(),
        dailyPrice: Number(dailyPrice),
        weeklyPrice: Number(weeklyPrice),
        monthlyPrice: Number(monthlyPrice),
      },
    });

    return successResponse(pkg, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الباقة');
  }
}

export const GET = withAuth(listPackagesHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(createPackageHandler), ['ADMIN', 'MANAGER']);
