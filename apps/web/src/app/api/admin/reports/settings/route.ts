import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { reportSettingsSchema } from '@hotel/shared';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;

    let settings = await prisma.reportSetting.findUnique({
      where: { hotelId: user.hotelId },
    });

    if (!settings) {
      settings = await prisma.reportSetting.create({
        data: { hotelId: user.hotelId },
      });
    }

    return successResponse(settings);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ‚ط§ط±ظٹط±');
  }
}

async function putHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const settings = await prisma.reportSetting.upsert({
      where: { hotelId: user.hotelId },
      update: {
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
        ...(body.headerText !== undefined ? { headerText: body.headerText } : {}),
        ...(body.footerText !== undefined ? { footerText: body.footerText } : {}),
        ...(body.taxNumber !== undefined ? { taxNumber: body.taxNumber } : {}),
      },
      create: {
        hotelId: user.hotelId,
        logoUrl: body.logoUrl,
        headerText: body.headerText,
        footerText: body.footerText,
        taxNumber: body.taxNumber,
      },
    });

    return successResponse(settings);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ طھط­ط¯ظٹط« ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ‚ط§ط±ظٹط±');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const PUT = withAuth(withCsrf(withValidation(reportSettingsSchema, putHandler)), ['ADMIN', 'MANAGER']);
