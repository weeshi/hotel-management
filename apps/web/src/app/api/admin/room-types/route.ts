import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const types = await prisma.roomType.findMany({
      where: { hotelId: user.hotelId },
      include: { _count: { select: { rooms: true } }, extraBeds: true, defaultServices: { include: { service: true } }, amenityServices: { include: { service: true } } },
      orderBy: { name: 'asc' },
    });
    return successResponse(
      types.map(t => ({
        ...t,
        amenityServiceIds: t.amenityServices.map(a => a.serviceId),
        amenities: t.amenityServices.map(a => a.service.nameAr || a.service.name),
        images: t.images ? JSON.parse(t.images) : [],
      }))
    );
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط£ظ†ظˆط§ط¹ ط§ظ„ط؛ط±ظپ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const type = await prisma.roomType.create({
      data: {
        hotelId: user.hotelId,
        name: body.name || body.nameAr,
        nameAr: body.nameAr,
        description: body.description,
        baseRate: body.baseRate,
        capacity: body.capacity || 2,
        images: body.images ? JSON.stringify(body.images) : undefined,
        extraBeds: body.extraBeds?.length > 0 ? { create: body.extraBeds.map((b: any) => ({ bedType: b.bedType, label: b.label, labelAr: b.labelAr, price: b.price, maxCount: b.maxCount })) } : undefined,
        defaultServices: body.defaultServices?.length > 0 ? { create: body.defaultServices.map((s: any) => ({ serviceId: s.serviceId, isFree: s.isFree ?? true })) } : undefined,
        amenityServices: body.amenityServiceIds?.length > 0 ? { create: body.amenityServiceIds.map((serviceId: string) => ({ serviceId })) } : undefined,
      },
      include: { extraBeds: true, defaultServices: { include: { service: true } }, amenityServices: { include: { service: true } } },
    });

    return successResponse({
      ...type,
      amenityServiceIds: type.amenityServices.map(a => a.serviceId),
      amenities: type.amenityServices.map(a => a.service.nameAr || a.service.name),
      images: type.images ? JSON.parse(type.images) : [],
    }, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ظ†ظˆط¹ ط§ظ„ط؛ط±ظپط©');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
