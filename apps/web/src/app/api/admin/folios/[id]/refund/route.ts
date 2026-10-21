import { NextRequest } from 'next/server';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/middlewares/auth';
import type { AuthenticatedRequest } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError, NotFoundError, ValidationError } from '@/lib/utils/errors';

const MAX_RETRIES = 3;

async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < MAX_RETRIES - 1) continue;
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function executeRefund(user: { userId: string; hotelId: string }, folioId: string, amount: number, method: 'WALLET' | 'CASH') {
  return runWithRetry(() =>
    tenantTx(
      async (tx) => {
        // --- Re-read folio INSIDE the transaction to guard against concurrent refunds ---
        const folio = await tx.folio.findUnique({
          where: { id: folioId },
          include: {
            booking: { select: { id: true, hotelId: true, guestId: true, bookingNo: true, guestName: true } },
            payments: { where: { status: 'SUCCEEDED' }, select: { method: true } },
          },
        });
        if (!folio) throw new NotFoundError('الفاتورة غير موجودة');
        if (folio.booking.hotelId !== user.hotelId) {
          throw new NotFoundError('الفاتورة غير موجودة');
        }

        const balance = Number(folio.balance);
        if (balance >= 0) throw new ValidationError('الفاتورة ليس بها رصيد زائد للتسوية');
        if (amount > Math.abs(balance)) {
          throw new ValidationError('المبلغ يتجاوز الرصيد الزائد المتاح');
        }

        if (method === 'CASH') {
          const hasCashPayments = folio.payments.some(
            (p) => p.method === 'CASH',
          );
          if (!hasCashPayments) {
            throw new ValidationError('لا يمكن الاسترداد نقداً. لم يسدد النزيل نقداً في هذه الفاتورة');
          }
        }

        const refundAmount = Number(amount);

        await tx.folioTransaction.create({
          data: {
            hotelId: folio.booking.hotelId,
            folioId,
            type: 'REFUND',
            category: 'REFUND',
            description: `استرداد رصيد زائد - ${method === 'WALLET' ? 'محفظة النزيل' : 'نقداً'}`,
            amount: -refundAmount,
            createdById: user.userId,
          },
        });

        await tx.folio.update({
          where: { id: folioId },
          data: {
            totalPaid: { decrement: refundAmount },
            balance: { increment: refundAmount },
          },
        });

        if (method === 'WALLET') {
          if (!folio.booking.guestId) {
            throw new ValidationError('النزيل ليس لديه محفظة');
          }

          const wallet = await tx.wallet.upsert({
            where: {
              guestId_hotelId: { guestId: folio.booking.guestId, hotelId: folio.booking.hotelId },
            },
            create: {
              guestId: folio.booking.guestId,
              hotelId: folio.booking.hotelId,
              balance: 0,
            },
            update: {},
          });

          const deposit = new Prisma.Decimal(refundAmount);
          const newBalance = wallet.balance.add(deposit);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance },
          });

          await tx.walletTransaction.create({
            data: {
              hotelId: folio.booking.hotelId,
              walletId: wallet.id,
              type: 'REFUND_FROM_FOLIO',
              amount: deposit,
              balanceBefore: wallet.balance,
              balanceAfter: newBalance,
              description: `استرداد رصيد زائد من فاتورة #${folio.booking.bookingNo}`,
              referenceId: folioId,
              method: method,
              status: 'COMPLETED',
              createdById: user.userId,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            hotelId: folio.booking.hotelId,
            userId: user.userId,
            action: 'FOLIO_REFUND',
            entity: 'FOLIO',
            entityId: folioId,
            oldValue: JSON.stringify({ balance: Number(folio.balance), totalPaid: Number(folio.totalPaid) }),
            newValue: JSON.stringify({ refundAmount, method }),
          },
        });

        return { refundAmount, method };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = (request as AuthenticatedRequest).user;
    if (!authUser?.hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);
    const user = { userId: authUser.userId, hotelId: authUser.hotelId };
    const body = await request.json();
    const { amount, method } = body;

    if (!amount || amount <= 0) return errorResponse('المبلغ المطلوب غير صالح', 400);
    if (!method || !['WALLET', 'CASH'].includes(method)) return errorResponse('طريقة الاسترداد غير صالحة', 400);

    const result = await executeRefund(user, params.id, amount, method);
    return successResponse(result);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse(error instanceof Error ? error.message : 'فشل تسوية الرصيد الزائد', 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION']);
