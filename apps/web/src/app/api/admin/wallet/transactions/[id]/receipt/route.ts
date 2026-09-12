import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse } from '@/lib/utils/api-response';
import { WalletReceiptPdfService } from '@/lib/services/wallet-receipt-pdf.service';

const pdfService = new WalletReceiptPdfService();

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const tx = await prisma.walletTransaction.findFirst({
      where: { id: params.id, wallet: { hotelId: user.hotelId } },
      include: {
        wallet: {
          include: { guest: { select: { name: true, phone: true } } },
        },
      },
    });
    if (!tx) return errorResponse('المعاملة غير موجودة', 404);

    let createdByName = '';
    if (tx.createdById) {
      const creator = await prisma.user.findFirst({
        where: { id: tx.createdById, hotelId: user.hotelId },
        select: { name: true },
      });
      createdByName = creator?.name || '';
    }

    const balanceBefore = await prisma.walletTransaction.aggregate({
      where: { walletId: tx.walletId, createdAt: { lt: tx.createdAt } },
      _sum: { amount: true },
    });

    const prevTx = await prisma.walletTransaction.findFirst({
      where: { walletId: tx.walletId, createdAt: { lt: tx.createdAt } },
      orderBy: { createdAt: 'desc' },
      include: { wallet: true },
    });
    const wallet = prevTx?.wallet || await prisma.wallet.findUnique({ where: { id: tx.walletId } });
    const balanceBeforeVal = Number(balanceBefore._sum?.amount || 0);
    const balanceAfterVal = balanceBeforeVal + Number(tx.amount);

    const receiptNo = `RCP-${tx.createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${tx.id.slice(0, 6).toUpperCase()}`;

    const pdf = await pdfService.generate({
      receiptNo,
      hotelName: 'فندق السلام',
      guestName: tx.wallet.guest.name,
      guestPhone: tx.wallet.guest.phone || undefined,
      type: tx.type === 'DEPOSIT' ? 'DEPOSIT' as const : 'WITHDRAWAL' as const,
      amount: Number(tx.amount),
      method: tx.method || undefined,
      description: tx.description || undefined,
      balanceBefore: balanceBeforeVal,
      balanceAfter: balanceAfterVal,
      createdBy: createdByName || 'النظام',
      createdAt: tx.createdAt,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${receiptNo}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('[RECEIPT PDF]', error);
    return errorResponse('فشل إنشاء الإيصال', 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
