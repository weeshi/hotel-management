import { prisma, tenantTx } from './prisma';

// bookingNo is globally unique (@@unique in schema), so the sequence must NOT
// restart per hotel — otherwise two hotels both generate BK-YYYYMM-0001 and
// collide. The BookingNumberCounter row is incremented atomically (UPDATE
// ... RETURNING), so concurrent injection calls can never read the same value.
export async function generateBookingNumber(): Promise<string> {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const seq = await tenantTx(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE "BookingNumberCounter"
      SET "value" = "value" + 1, "updatedAt" = now()
      WHERE "key" = 'bookingNo'
      RETURNING "value"`;

    if (rows.length > 0) return rows[0].value;

    // First use (pre-migration rows exist) — seed from the max existing
    // sequence so we never reuse a number already present in the database.
    // NOTE: under a TENANT span, `booking` is RLS-scoped to that hotel; the
    // global counter row itself is not (BookingNumberCounter is a global table).
    const last = await tx.booking.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { bookingNo: true },
    });

    let nextSeq = 1;
    if (last?.bookingNo) {
      const parts = last.bookingNo.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    const seeded = await tx.bookingNumberCounter.create({
      data: { key: 'bookingNo', value: nextSeq },
    });
    return seeded.value;
  });

  return `BK-${year}${month}-${String(seq).padStart(4, '0')}`;
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
