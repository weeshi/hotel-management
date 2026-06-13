import { prisma } from './prisma';

export async function generateBookingNumber(hotelId: string): Promise<string> {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const lastBooking = await prisma.booking.findFirst({
    where: { hotelId },
    orderBy: { createdAt: 'desc' },
    select: { bookingNo: true },
  });

  let nextSeq = 1;
  if (lastBooking?.bookingNo) {
    const parts = lastBooking.bookingNo.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `BK-${year}${month}-${String(nextSeq).padStart(4, '0')}`;
}

export async function generateInvoiceNumber(hotelId: string): Promise<string> {
  const date = new Date();
  const year = date.getFullYear();

  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNo: true },
  });

  let nextSeq = 1;
  if (lastInvoice?.invoiceNo) {
    const parts = lastInvoice.invoiceNo.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `INV-${year}-${String(nextSeq).padStart(5, '0')}`;
}
