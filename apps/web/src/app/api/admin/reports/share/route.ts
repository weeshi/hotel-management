import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { reportShareSchema } from '@hotel/shared';
import { sendEmail } from '@/lib/gateways/email.gateway';
import { fetchReportData, buildPrintHtml } from '@/lib/utils/report-helpers';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const hotel = await prisma.hotel.findUnique({
      where: { id: user.hotelId },
      select: { name: true, nameAr: true },
    });
    const hotelName = hotel?.nameAr || hotel?.name || 'ط§ظ„ظپظ†ط¯ظ‚';

    const report = await fetchReportData(body.type, user.hotelId, body.dateFrom, body.dateTo);
    const settings = await prisma.reportSetting.findUnique({ where: { hotelId: user.hotelId } });
    const html = buildPrintHtml(report.title, report.tables, settings, hotelName);

    const results: { email: string; success: boolean }[] = [];

    for (const email of body.emails) {
      const result = await sendEmail({
        to: email,
        subject: `ًں“ٹ ${report.title} â€” ${hotelName}`,
        html: body.message
          ? `<div style="margin-bottom:16px;padding:12px;background:#f9f9f9;border-radius:8px;font-size:14px;">${body.message}</div>${html}`
          : html,
      });
      results.push({ email, success: result.success });

      await prisma.notification.create({
        data: {
          hotelId: user.hotelId,
          type: 'REPORT_SHARE',
          event: `share_${body.type}`,
          recipient: email,
          subject: `ًں“ٹ ${report.title}`,
          body: body.message || '',
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
        },
      });
    }

    const succeeded = results.filter(r => r.success).length;

    return successResponse({
      sent: succeeded,
      failed: results.length - succeeded,
      total: results.length,
      details: results,
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ظ…ط´ط§ط±ظƒط© ط§ظ„طھظ‚ط±ظٹط±');
  }
}

export const POST = withAuth(withCsrf(withValidation(reportShareSchema, handler)), ['ADMIN', 'MANAGER']);
