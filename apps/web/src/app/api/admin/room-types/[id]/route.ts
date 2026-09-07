import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const roomType = await prisma.roomType.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: {
        _count: { select: { rooms: true } },
        extraBeds: true,
        defaultServices: { include: { service: { include: { category: true } } } },
        amenityServices: { include: { service: true } },
      },
    });
    if (!roomType) return errorResponse('نوع الغرفة غير موجود', 404);

    return successResponse({
      ...roomType,
      amenityServiceIds: roomType.amenityServices.map(a => a.serviceId),
      amenities: roomType.amenityServices.map(a => a.service.nameAr || a.service.name),
      images: roomType.images ? JSON.parse(roomType.images) : [],
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب نوع الغرفة');
  }
}

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const existing = await prisma.roomType.findFirst({ where: { id: params.id, hotelId: user.hotelId } });
    if (!existing) return errorResponse('نوع الغرفة غير موجود', 404);

    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.nameAr !== undefined) data.nameAr = body.nameAr;
    if (body.description !== undefined) data.description = body.description;
    if (body.baseRate) data.baseRate = body.baseRate;
    if (body.capacity) data.capacity = body.capacity;
    if (body.images) data.images = JSON.stringify(body.images);

    // Update amenity services
    if (body.amenityServiceIds) {
      await prisma.roomTypeAmenity.deleteMany({ where: { roomTypeId: params.id } });
      if (body.amenityServiceIds.length > 0) {
        await prisma.roomTypeAmenity.createMany({
          data: body.amenityServiceIds.map((serviceId: string) => ({ roomTypeId: params.id, serviceId })),
        });
      }
    }

    const roomType = await prisma.roomType.update({
      where: { id: params.id },
      data,
      include: { extraBeds: true, defaultServices: { include: { service: true } }, amenityServices: { include: { service: true } } },
    });

    // Update extra beds
    if (body.extraBeds) {
      await prisma.roomTypeExtraBed.deleteMany({ where: { roomTypeId: params.id } });
      if (body.extraBeds.length > 0) {
        await prisma.roomTypeExtraBed.createMany({
          data: body.extraBeds.map((b: any) => ({ roomTypeId: params.id, bedType: b.bedType, label: b.label, labelAr: b.labelAr, price: b.price, maxCount: b.maxCount })),
        });
      }
    }

    // Update default services
    if (body.defaultServices) {
      await prisma.roomTypeDefaultService.deleteMany({ where: { roomTypeId: params.id } });
      if (body.defaultServices.length > 0) {
        await prisma.roomTypeDefaultService.createMany({
          data: body.defaultServices.map((s: any) => ({ roomTypeId: params.id, serviceId: s.serviceId, isFree: s.isFree ?? true })),
        });
      }
    }

    return successResponse({ ...roomType, amenityServiceIds: roomType.amenityServices.map(a => a.serviceId), amenities: roomType.amenityServices.map(a => a.service.nameAr || a.service.name), images: roomType.images ? JSON.parse(roomType.images) : [] });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث نوع الغرفة');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const roomType = await prisma.roomType.findFirst({ where: { id: params.id, hotelId: user.hotelId } });
    if (!roomType) return errorResponse('نوع الغرفة غير موجود', 404);

    const count = await prisma.room.count({ where: { roomTypeId: params.id } });
    if (count > 0) return errorResponse('لا يمكن حذف نوع غرفة يحتوي على غرف', 400);

    await prisma.roomTypeExtraBed.deleteMany({ where: { roomTypeId: params.id } });
    await prisma.roomTypeDefaultService.deleteMany({ where: { roomTypeId: params.id } });
    await prisma.roomType.delete({ where: { id: params.id } });

    return successResponse({ deleted: true });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حذف نوع الغرفة');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
