import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { Prisma } from '@prisma/client';
import { BookingService } from '@/lib/services/booking.service';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { WalletService } from '@/lib/services/wallet.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog, createNotification } from '@/lib/services';
import { ForbiddenError } from '@/lib/utils/errors';

const bookingService = new BookingService();
const folioRepo = new FolioRepository();
const walletService = new WalletService();

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { folio: true, guest: true },
    });
    if (!booking) return errorResponse('الحجز غير موجود', 404);
    if (booking.status !== 'CHECKED_IN') return errorResponse('النزيل ليس في إقامة نشطة', 400);

    // Process payment if provided
    if (body.payment) {
      const { method, amount } = body.payment;
      if (!method || !amount || amount <= 0) return errorResponse('طريقة الدفع والمبلغ مطلوبان', 400);

      if (method === 'WALLET') {
        // Pay from guest wallet (hotel-specific)
        if (!booking.guestId) return errorResponse('النزيل ليس لديه محفظة', 400);
        const wallet = await prisma.wallet.findFirst({
          where: { guestId: booking.guestId, hotelId: booking.hotelId },
        });
        if (!wallet || Number(wallet.balance) < amount) return errorResponse('الرصيد غير كافٍ في المحفظة', 400);
        const amountDecimal = new Prisma.Decimal(amount);
        const newBalance = wallet.balance.sub(amountDecimal);
        await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await prisma.walletTransaction.create({
          data: { walletId: wallet.id, type: 'PAYMENT', amount: amountDecimal.negated(), balanceBefore: wallet.balance, balanceAfter: newBalance, description: `تسديد فاتورة #${booking.bookingNo}`, referenceId: params.id },
        });
        const payment = await prisma.payment.create({
          data: { bookingId: params.id, folioId: booking.folio?.id, amount, method: 'WALLET', status: 'SUCCEEDED' },
        });
        if (booking.folio) await folioRepo.applyPayment(booking.folio.id, payment.id, amount);
      } else {
        // Standard payment (CASH, CARD, etc.)
        const payment = await prisma.payment.create({
          data: { bookingId: params.id, folioId: booking.folio?.id, amount, method, status: 'SUCCEEDED' },
        });
        if (booking.folio) await folioRepo.applyPayment(booking.folio.id, payment.id, amount);
      }
    }

    // Debt migration to wallet (ADMIN/MANAGER only)
    if (body.action === 'MIGRATE') {
      if (!['ADMIN', 'MANAGER'].includes(user.role)) {
        return errorResponse('فقط المدير يمكنه ترحيل الديون إلى المحفظة', 403);
      }
      if (!booking.folio || Number(booking.folio.balance) <= 0) {
        return errorResponse('لا يوجد رصيد مستحق للترحيل', 400);
      }
      if (!booking.guestId) {
        return errorResponse('النزيل ليس لديه محفظة', 400);
      }

      const amount = Number(booking.folio.balance);

      await walletService.migrateDebt({
        guestId: booking.guestId,
        hotelId: booking.hotelId,
        bookingId: booking.id,
        bookingNo: booking.bookingNo,
        amount,
        createdById: user.userId,
        userRole: user.role,
      });

      const payment = await prisma.payment.create({
        data: {
          bookingId: params.id,
          folioId: booking.folio.id,
          amount,
          method: 'WALLET',
          status: 'SUCCEEDED',
        },
      });
      await folioRepo.applyPayment(booking.folio.id, payment.id, amount);
    }

    // Check-out: process charges + settle
    const updated = await bookingService.checkOut(params.id, user.userId);

    const { sendBookingNotification } = await import('@/lib/services/notification.service');
    sendBookingNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'CHECKED_OUT',
      bookingNo: booking.bookingNo,
    });

    // Send invoice PDF via email if guest has email
    if (booking.guest?.email && booking.folio) {
      try {
        const { InvoicePdfService } = await import('@/lib/services/invoice-pdf.service');
        const { sendEmail, buildBookingTemplate } = await import('@/lib/gateways/email.gateway');
        const pdfService = new InvoicePdfService();
        const folioSummary = await folioRepo.findByBookingId(booking.id);
        if (folioSummary) {
          const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${folioSummary.id.slice(0, 6).toUpperCase()}`;
          const pdfBuffer = await pdfService.generate({
            invoiceNo,
            folioId: folioSummary.id,
            hotelName: 'فندق السلام',
            guestName: booking.guest.name,
            guestEmail: booking.guest.email,
            rooms: (folioSummary as any).booking?.rooms?.map((r: any) => ({
              number: r.room?.roomNumber || '',
              checkIn: r.checkIn?.toISOString(),
              checkOut: r.checkOut?.toISOString(),
              nightlyRate: Number(r.nightlyRate),
            })) || [],
            transactions: folioSummary.transactions.map((t: any) => ({
              description: t.description,
              amount: Number(t.amount),
              taxAmount: t.taxAmount ? Number(t.taxAmount) : 0,
              createdAt: t.createdAt?.toISOString(),
            })),
            totalCharges: Number(folioSummary.totalCharges),
            totalPaid: Number(folioSummary.totalPaid),
            balance: Number(folioSummary.balance),
            payments: (folioSummary as any).payments?.map((p: any) => ({
              method: p.method,
              amount: Number(p.amount),
              createdAt: p.createdAt?.toISOString(),
              status: p.status,
            })) || [],
          });
          const emailContent = buildBookingTemplate('CHECKED_OUT', {
            guestName: booking.guest.name,
            bookingNo: booking.bookingNo,
            hotelName: 'فندق السلام',
          });
          await sendEmail({
            to: booking.guest.email,
            subject: emailContent.subject,
            html: emailContent.html,
            attachments: [{ filename: `فاتورة-${invoiceNo}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
          });
        }
      } catch (pdfErr: any) {
        console.error('[CHECKOUT] PDF email failed:', pdfErr.message);
      }
    }

    createAuditLog({
      hotelId: booking.hotelId,
      userId: user.userId,
      action: 'CHECK_OUT',
      entity: 'BOOKING',
      entityId: booking.id,
      newValue: JSON.stringify({ status: updated.status, payment: body.payment }),
    });

    createNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'CHECK_OUT',
      event: 'booking.checkout',
      recipient: 'RECEPTION',
      subject: `تسجيل خروج #${booking.bookingNo}`,
      body: body.payment ? `تم تسجيل الخروج والدفع بقيمة ${body.payment.amount} د.ل` : 'تم تسجيل خروج النزيل',
    });

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تسجيل الخروج', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION']);
