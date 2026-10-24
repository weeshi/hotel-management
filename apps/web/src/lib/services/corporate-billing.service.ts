import { z } from 'zod';
import type { Invoice } from '@prisma/client';
import { PaymentMethod } from '@prisma/client';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { createAuditLog } from './audit.service';

// --- Corporate invoice lifecycle status guard (single source of truth) ---
export const CORPORATE_INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;
export type CorporateInvoiceStatus = (typeof CORPORATE_INVOICE_STATUSES)[number];

export const corporateInvoiceStatusSchema = z.enum(CORPORATE_INVOICE_STATUSES);

export interface CorporateInvoiceLineItem {
  description: string;
  amount: number;
  folioId?: string;
  bookingNo?: string;
}

export interface GenerateMonthlyStatementParams {
  hotelId: string;
  externalClientId: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate?: Date;
  taxRate?: number;
  notes?: string;
  lineItems?: CorporateInvoiceLineItem[];
  userId?: string;
}

export interface RecordInvoicePaymentParams {
  hotelId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  userId?: string;
}

export interface CorporateInvoiceSummary {
  id: string;
  invoiceNo: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  dueDate: Date | null;
  paidAt: Date | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  outstandingBalance: number;
  createdAt: Date;
}

export interface ClientStatement {
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueBalance: number;
    invoiceCount: number;
  };
  invoices: CorporateInvoiceSummary[];
}

const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'وصف البند مطلوب'),
  amount: z.number(),
  folioId: z.string().optional(),
  bookingNo: z.string().optional(),
});

const generateStatementSchema = z.object({
  hotelId: z.string().min(1),
  externalClientId: z.string().min(1),
  periodStart: z.coerce.date({ invalid_type_error: 'تاريخ بداية الفترة غير صالح' }),
  periodEnd: z.coerce.date({ invalid_type_error: 'تاريخ نهاية الفترة غير صالح' }),
  dueDate: z.coerce.date({ invalid_type_error: 'تاريخ الاستحقاق غير صالح' }).optional(),
  taxRate: z.number().min(0, 'نسبة الضريبة غير صالحة').max(1, 'نسبة الضريبة غير صالحة').optional(),
  notes: z.string().trim().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  userId: z.string().optional(),
});

const recordPaymentSchema = z.object({
  hotelId: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number().positive('قيمة الدفعة يجب أن تكون موجبة'),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().optional(),
  userId: z.string().optional(),
});

// Request-body schemas (server-derived identifiers are injected by the route layer).
export const generateStatementBodySchema = generateStatementSchema.omit({
  hotelId: true,
  externalClientId: true,
  userId: true,
});

export const recordPaymentBodySchema = recordPaymentSchema.omit({
  hotelId: true,
  invoiceId: true,
  userId: true,
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class CorporateBillingService {
  async generateMonthlyStatement(
    params: GenerateMonthlyStatementParams,
  ): Promise<CorporateInvoiceSummary> {
    const parsed = generateStatementSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'بيانات الفاتورة غير صالحة');
    }

    const {
      hotelId,
      externalClientId,
      periodStart,
      periodEnd,
      dueDate,
      taxRate,
      notes,
      lineItems,
      userId,
    } = parsed.data;

    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new ValidationError('نطاق الفترة الزمنية غير صالح');
    }

    const client = await prisma.externalClient.findFirst({
      where: { id: externalClientId, hotelId },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundError('العميل الخارجي غير موجود');

    const explicitItems: CorporateInvoiceLineItem[] = lineItems ?? [];
    const autoItems =
      explicitItems.length > 0
        ? []
        : await this.collectUnbilledItems(hotelId, client.id, client.name, periodStart, periodEnd);

    const items = [...autoItems, ...explicitItems];
    if (items.length === 0) {
      throw new ValidationError('لا توجد بنود مستحقة خلال الفترة المحددة');
    }

    const subtotal = round2(items.reduce((sum, item) => sum + Number(item.amount), 0));
    const rate = taxRate ?? 0;
    const taxAmount = round2(subtotal * rate);
    const total = round2(subtotal + taxAmount);

    const normalizedItems = items.map((item) => ({
      description: item.description,
      amount: item.amount,
      folioId: item.folioId ?? null,
      bookingNo: item.bookingNo ?? null,
    }));

    return tenantTx(async (tx) => {
      const year = periodEnd.getUTCFullYear();
      const month = String(periodEnd.getUTCMonth() + 1).padStart(2, '0');

      const rows = await tx.$queryRaw<Array<{ value: number }>>`
        UPDATE "BookingNumberCounter"
        SET "value" = "value" + 1, "updatedAt" = now()
        WHERE "key" = 'corpInvoiceNo'
        RETURNING "value"`;

      const seq =
        rows.length > 0
          ? rows[0].value
          : (await tx.bookingNumberCounter.create({ data: { key: 'corpInvoiceNo', value: 1 } }))
              .value;

      const invoiceNo = `CORP-${year}${month}-${String(seq).padStart(4, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          hotelId,
          externalClientId,
          invoiceNo,
          status: 'ISSUED',
          periodStart,
          periodEnd,
          dueDate: dueDate ?? null,
          subtotal,
          taxAmount,
          total,
          paidAmount: 0,
          notes: notes ?? null,
          items: normalizedItems,
        },
      });

      await createAuditLog({
        hotelId,
        userId,
        action: 'CREATE_CORPORATE_INVOICE',
        entity: 'INVOICE',
        entityId: invoice.id,
        newValue: JSON.stringify({
          invoiceNo,
          externalClientId,
          periodStart,
          periodEnd,
          subtotal,
          taxAmount,
          total,
          itemCount: normalizedItems.length,
        }),
      });

      return this.toInvoiceSummary(invoice);
    });
  }

  async recordInvoicePayment(params: RecordInvoicePaymentParams): Promise<CorporateInvoiceSummary> {
    const parsed = recordPaymentSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'بيانات الدفعة غير صالحة');
    }

    const { hotelId, invoiceId, amount, method, reference, userId } = parsed.data;

    return tenantTx(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Invoice"
        WHERE "id" = ${invoiceId} AND "hotelId" = ${hotelId}
        FOR UPDATE`;

      if (locked.length === 0) throw new NotFoundError('الفاتورة غير موجودة');

      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, hotelId } });
      if (!invoice) throw new NotFoundError('الفاتورة غير موجودة');

      if (invoice.status === 'VOID') {
        throw new ValidationError('لا يمكن تسجيل دفعة على فاتورة ملغاة');
      }
      if (invoice.status === 'PAID') {
        throw new ValidationError('الفاتورة مسددة بالكامل بالفعل');
      }

      const total = round2(Number(invoice.total));
      const currentPaid = round2(Number(invoice.paidAmount));
      const newPaid = round2(currentPaid + amount);

      if (newPaid > round2(total) + 0.005) {
        throw new ValidationError('قيمة الدفعة تتجاوز الرصيد المستحق');
      }

      const fullyPaid = newPaid >= round2(total) - 0.005;

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          status: fullyPaid ? 'PAID' : invoice.status,
          paidAt: fullyPaid ? new Date() : invoice.paidAt,
        },
      });

      await createAuditLog({
        hotelId,
        userId,
        action: 'PAY_CORPORATE_INVOICE',
        entity: 'INVOICE',
        entityId: invoice.id,
        newValue: JSON.stringify({
          amount,
          method,
          reference: reference ?? null,
          paidAmount: newPaid,
          status: updated.status,
        }),
      });

      return this.toInvoiceSummary(updated);
    });
  }

  async getClientStatement(hotelId: string, externalClientId: string): Promise<ClientStatement> {
    const client = await prisma.externalClient.findFirst({
      where: { id: externalClientId, hotelId },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (!client) throw new NotFoundError('العميل الخارجي غير موجود');

    const invoices = await prisma.invoice.findMany({
      where: { hotelId, externalClientId },
      orderBy: { createdAt: 'desc' },
    });

    const summaries = invoices.map((invoice) => this.toInvoiceSummary(invoice));
    const active = summaries.filter((invoice) => invoice.status !== 'VOID');

    const totalInvoiced = round2(active.reduce((sum, invoice) => sum + invoice.total, 0));
    const totalPaid = round2(active.reduce((sum, invoice) => sum + invoice.paidAmount, 0));
    const outstandingBalance = round2(
      active.reduce((sum, invoice) => sum + invoice.outstandingBalance, 0),
    );

    const now = new Date();
    const overdueBalance = round2(
      active
        .filter(
          (invoice) =>
            invoice.status === 'ISSUED' &&
            invoice.dueDate !== null &&
            invoice.dueDate.getTime() < now.getTime(),
        )
        .reduce((sum, invoice) => sum + invoice.outstandingBalance, 0),
    );

    return {
      client,
      summary: {
        totalInvoiced,
        totalPaid,
        outstandingBalance,
        overdueBalance,
        invoiceCount: active.length,
      },
      invoices: summaries,
    };
  }

  private async collectUnbilledItems(
    hotelId: string,
    externalClientId: string,
    clientName: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CorporateInvoiceLineItem[]> {
    const boxes = await prisma.safeDepositBox.findMany({
      where: { hotelId, externalClientId, bookingId: { not: null } },
      select: { bookingId: true },
    });
    const boxBookingIds = boxes
      .map((box) => box.bookingId)
      .filter((value): value is string => Boolean(value));

    const groups = await prisma.groupBooking.findMany({
      where: { hotelId, companyName: { equals: clientName, mode: 'insensitive' } },
      select: { bookings: { select: { id: true } } },
    });
    const groupBookingIds = groups.flatMap((group) => group.bookings.map((booking) => booking.id));

    const bookingIds = Array.from(new Set([...boxBookingIds, ...groupBookingIds]));
    if (bookingIds.length === 0) return [];

    const folios = await prisma.folio.findMany({
      where: { hotelId, bookingId: { in: bookingIds } },
      select: { id: true, booking: { select: { bookingNo: true } } },
    });
    if (folios.length === 0) return [];

    // A folio is "already billed" when it appears on any non-VOID invoice, either
    // through Invoice.folioId or as a line-item snapshot (items[].folioId).
    const existingInvoices = await prisma.invoice.findMany({
      where: { hotelId, status: { not: 'VOID' } },
      select: { folioId: true, items: true },
    });
    const billedFolioIds = new Set<string>();
    for (const invoice of existingInvoices) {
      if (invoice.folioId) billedFolioIds.add(invoice.folioId);
      if (Array.isArray(invoice.items)) {
        for (const item of invoice.items) {
          if (!isRecord(item)) continue;
          const folioId = item.folioId;
          if (typeof folioId === 'string') billedFolioIds.add(folioId);
        }
      }
    }

    const items: CorporateInvoiceLineItem[] = [];
    for (const folio of folios) {
      if (billedFolioIds.has(folio.id)) continue;

      const transactions = await prisma.folioTransaction.findMany({
        where: {
          hotelId,
          folioId: folio.id,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        select: { type: true, amount: true },
      });

      const amount = round2(
        transactions.reduce(
          (sum, transaction) =>
            transaction.type === 'CHARGE' || transaction.type === 'DISCOUNT'
              ? sum + Number(transaction.amount)
              : sum,
          0,
        ),
      );
      if (Math.abs(amount) < 0.005) continue;

      items.push({
        description: `فاتورة حجز ${folio.booking?.bookingNo ?? folio.id.slice(0, 8)}`,
        amount,
        folioId: folio.id,
        bookingNo: folio.booking?.bookingNo ?? undefined,
      });
    }

    return items;
  }

  private toInvoiceSummary(invoice: Invoice): CorporateInvoiceSummary {
    const total = round2(Number(invoice.total));
    const paidAmount = round2(Number(invoice.paidAmount));

    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      status: invoice.status,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      subtotal: round2(Number(invoice.subtotal)),
      taxAmount: round2(Number(invoice.taxAmount)),
      total,
      paidAmount,
      outstandingBalance: round2(Math.max(0, total - paidAmount)),
      createdAt: invoice.createdAt,
    };
  }
}
