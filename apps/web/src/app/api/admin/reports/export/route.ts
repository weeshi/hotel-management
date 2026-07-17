import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse } from '@/lib/utils/api-response';
import { fetchReportData, toCsv, buildPrintHtml } from '@/lib/utils/report-helpers';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'occupancy';
    const format = searchParams.get('format') || 'json';
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    const report: any = await fetchReportData(type, user.hotelId, dateFrom, dateTo);

    if (format === 'json') {
      return new Response(JSON.stringify({ success: true, data: report.flatData }, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${type}-report.json"` },
      });
    }

    if (format === 'csv') {
      const csv = toCsv(report.flatData, report.keyLabels);
      return new Response('\uFEFF' + csv, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${type}-report.csv"` },
      });
    }

    if (format === 'print') {
      const hotel = await prisma.hotel.findUnique({ where: { id: user.hotelId }, select: { name: true } });
      const settings = await prisma.reportSetting.findUnique({ where: { hotelId: user.hotelId } });
      const html = buildPrintHtml(report.title, report.tables, settings, hotel?.name || '');
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return errorResponse('ط§ظ„طھظ†ط³ظٹظ‚ ط؛ظٹط± ظ…ط¯ط¹ظˆظ…');
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ طھطµط¯ظٹط± ط§ظ„طھظ‚ط±ظٹط±');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
