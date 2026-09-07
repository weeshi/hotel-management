import { NextRequest } from 'next/server';
import { FolioService } from '@/lib/services/folio.service';
import { InvoicePdfService } from '@/lib/services/invoice-pdf.service';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse } from '@/lib/utils/api-response';

const folioService = new FolioService();
const pdfService = new InvoicePdfService();

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const summary = await folioService.getFolioSummary(params.id, user.hotelId);

    const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${params.id.slice(0, 6).toUpperCase()}`;

    const invoice = await prisma.invoice.create({
      data: { folioId: params.id, invoiceNo },
    });

    const buffer = await pdfService.generate({
      invoiceNo: invoice.invoiceNo,
      folioId: params.id,
      hotelName: 'فندق السلام',
      guestName: summary.guest.name || '',
      guestEmail: summary.guest.email || undefined,
      rooms: summary.rooms.map((r: any) => ({
        number: r.number,
        checkIn: typeof r.checkIn === 'string' ? r.checkIn : new Date(r.checkIn).toISOString(),
        checkOut: typeof r.checkOut === 'string' ? r.checkOut : new Date(r.checkOut).toISOString(),
        nightlyRate: r.nightlyRate,
      })),
      transactions: summary.transactions.map((t: any) => ({
        description: t.description,
        amount: Number(t.amount),
        taxAmount: t.taxAmount ? Number(t.taxAmount) : 0,
        createdAt: t.createdAt?.toISOString?.() || t.createdAt,
      })),
      totalCharges: summary.totalCharges,
      totalPaid: summary.totalPaid,
      balance: summary.balance,
      payments: summary.payments.map((p: any) => ({
        method: p.method,
        amount: Number(p.amount),
        createdAt: p.createdAt?.toISOString?.() || p.createdAt,
        status: p.status,
      })),
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfUrl: `/api/folio/${params.id}/invoice-pdf` },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="فاتورة-${invoiceNo}.pdf"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل توليد PDF', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'ACCOUNTANT']);
