import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  CorporateBillingService,
  CORPORATE_INVOICE_STATUSES,
} from '@/lib/services/corporate-billing.service';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { prismaRaw, resetDb, seedTestData, closeDb } from '../helpers/db';
import { asTenant } from '../helpers/tenant';

const service = new CorporateBillingService();

let data: Awaited<ReturnType<typeof seedTestData>>;
let clientId: string;
let folioId: string;

const PERIOD_START = new Date('2026-03-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-03-31T23:59:59.000Z');

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();

  const client = await prismaRaw.externalClient.create({
    data: { hotelId: data.hotel.id, name: 'شركة الفجر', email: 'ap@fajr.ly', phone: '0910000000' },
  });
  clientId = client.id;

  // Auto-collection links corporate charges through GroupBooking.companyName === client.name.
  const group = await prismaRaw.groupBooking.create({
    data: {
      hotelId: data.hotel.id,
      name: 'وفد الفجر',
      companyName: 'شركة الفجر',
      status: 'ACTIVE',
    },
  });

  const booking = await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: 'CORP-BK-001',
      guestName: 'وفد الفجر',
      status: 'CONFIRMED',
      source: 'RECEPTION',
      adults: 5,
      children: 0,
      groupBookingId: group.id,
    },
  });

  const folio = await prismaRaw.folio.create({
    data: { hotelId: data.hotel.id, bookingId: booking.id, status: 'ACTIVE' },
  });
  folioId = folio.id;

  await prismaRaw.folioTransaction.createMany({
    data: [
      {
        hotelId: data.hotel.id,
        folioId: folio.id,
        type: 'CHARGE',
        category: 'ROOM_CHARGE',
        description: 'غرف',
        amount: 1500,
        createdAt: new Date('2026-03-10T10:00:00.000Z'),
      },
      {
        hotelId: data.hotel.id,
        folioId: folio.id,
        type: 'CHARGE',
        category: 'SERVICE',
        description: 'خدمات',
        amount: 500,
        createdAt: new Date('2026-03-12T10:00:00.000Z'),
      },
    ],
  });
});

afterAll(async () => {
  await closeDb();
});

describe('Corporate Billing — monthly statement generation', () => {
  it('generates a CORP invoice from unbilled folios with accurate subtotal + tax = total', async () => {
    const invoice = await asTenant(data.hotel.id, () =>
      service.generateMonthlyStatement({
        hotelId: data.hotel.id,
        externalClientId: clientId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        taxRate: 0.1,
        dueDate: new Date('2026-04-15T00:00:00.000Z'),
      }),
    );

    expect(invoice.invoiceNo).toMatch(/^CORP-\d{6}-\d{4}$/);
    expect(invoice.invoiceNo.startsWith('CORP-202603-')).toBe(true);
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.subtotal).toBe(2000);
    expect(invoice.taxAmount).toBe(200);
    expect(invoice.total).toBe(2200);
    expect(invoice.paidAmount).toBe(0);
    expect(invoice.outstandingBalance).toBe(2200);

    const stored = await prismaRaw.invoice.findFirst({ where: { id: invoice.id } });
    expect(stored?.total).toBe(2200);

    const audit = await prismaRaw.auditLog.findFirst({
      where: { hotelId: data.hotel.id, action: 'CREATE_CORPORATE_INVOICE', entityId: invoice.id },
    });
    expect(audit).not.toBeNull();
  });

  it('does not double-bill an already invoiced folio', async () => {
    await asTenant(data.hotel.id, () =>
      service.generateMonthlyStatement({
        hotelId: data.hotel.id,
        externalClientId: clientId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      }),
    );

    await expect(
      asTenant(data.hotel.id, () =>
        service.generateMonthlyStatement({
          hotelId: data.hotel.id,
          externalClientId: clientId,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('supports explicit line items (accounting-selected contract charges)', async () => {
    const invoice = await asTenant(data.hotel.id, () =>
      service.generateMonthlyStatement({
        hotelId: data.hotel.id,
        externalClientId: clientId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        taxRate: 0.1,
        lineItems: [
          { description: 'إيجار قاعة اجتماعات', amount: 800 },
          { description: 'خدمة ضيافة', amount: 200, folioId },
        ],
      }),
    );

    expect(invoice.subtotal).toBe(1000);
    expect(invoice.taxAmount).toBe(100);
    expect(invoice.total).toBe(1100);

    const stored = await prismaRaw.invoice.findFirst({ where: { id: invoice.id } });
    const items = stored?.items;
    expect(Array.isArray(items)).toBe(true);
    if (!Array.isArray(items)) throw new Error('invoice items must be an array snapshot');
    expect(items.length).toBe(2);
  });

  it('rejects an unknown external client', async () => {
    await expect(
      asTenant(data.hotel.id, () =>
        service.generateMonthlyStatement({
          hotelId: data.hotel.id,
          externalClientId: '00000000-0000-0000-0000-000000000000',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Corporate Billing — invoice payments', () => {
  async function createInvoice(): Promise<string> {
    const invoice = await asTenant(data.hotel.id, () =>
      service.generateMonthlyStatement({
        hotelId: data.hotel.id,
        externalClientId: clientId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        taxRate: 0.1,
        dueDate: new Date('2026-04-15T00:00:00.000Z'),
      }),
    );
    return invoice.id;
  }

  it('records partial then full payment, transitioning ISSUED -> PAID with paidAt', async () => {
    const invoiceId = await createInvoice();

    const partial = await asTenant(data.hotel.id, () =>
      service.recordInvoicePayment({
        hotelId: data.hotel.id,
        invoiceId,
        amount: 1000,
        method: 'BANK_TRANSFER',
        reference: 'TRF-001',
      }),
    );
    expect(partial.status).toBe('ISSUED');
    expect(partial.paidAmount).toBe(1000);
    expect(partial.outstandingBalance).toBe(1200);
    expect(partial.paidAt).toBeNull();

    const full = await asTenant(data.hotel.id, () =>
      service.recordInvoicePayment({
        hotelId: data.hotel.id,
        invoiceId,
        amount: 1200,
        method: 'CASH',
      }),
    );
    expect(full.status).toBe('PAID');
    expect(full.paidAmount).toBe(2200);
    expect(full.outstandingBalance).toBe(0);
    expect(full.paidAt).not.toBeNull();

    const audit = await prismaRaw.auditLog.findFirst({
      where: { hotelId: data.hotel.id, action: 'PAY_CORPORATE_INVOICE', entityId: invoiceId },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects overpayment and any payment on a paid invoice', async () => {
    const invoiceId = await createInvoice();

    await expect(
      asTenant(data.hotel.id, () =>
        service.recordInvoicePayment({
          hotelId: data.hotel.id,
          invoiceId,
          amount: 5000,
          method: 'CASH',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await asTenant(data.hotel.id, () =>
      service.recordInvoicePayment({
        hotelId: data.hotel.id,
        invoiceId,
        amount: 2200,
        method: 'CASH',
      }),
    );

    await expect(
      asTenant(data.hotel.id, () =>
        service.recordInvoicePayment({
          hotelId: data.hotel.id,
          invoiceId,
          amount: 1,
          method: 'CASH',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects payment on a VOID invoice', async () => {
    const invoiceId = await createInvoice();
    await prismaRaw.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } });

    await expect(
      asTenant(data.hotel.id, () =>
        service.recordInvoicePayment({
          hotelId: data.hotel.id,
          invoiceId,
          amount: 100,
          method: 'CASH',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Corporate Billing — client statement & aging', () => {
  it('computes totalInvoiced / totalPaid / outstanding / overdue balances', async () => {
    // Overdue invoice: dueDate in the past, partially paid.
    const overdueInvoice = await asTenant(data.hotel.id, () =>
      service.generateMonthlyStatement({
        hotelId: data.hotel.id,
        externalClientId: clientId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        taxRate: 0.1,
        dueDate: new Date('2026-04-15T00:00:00.000Z'),
      }),
    );
    await asTenant(data.hotel.id, () =>
      service.recordInvoicePayment({
        hotelId: data.hotel.id,
        invoiceId: overdueInvoice.id,
        amount: 1000,
        method: 'BANK_TRANSFER',
      }),
    );

    // Not-yet-due invoice assembled from explicit line items.
    await asTenant(data.hotel.id, () =>
      service.generateMonthlyStatement({
        hotelId: data.hotel.id,
        externalClientId: clientId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        taxRate: 0,
        dueDate: new Date('2030-01-01T00:00:00.000Z'),
        lineItems: [{ description: 'عقد صيانة سنوي', amount: 500 }],
      }),
    );

    const statement = await asTenant(data.hotel.id, () =>
      service.getClientStatement(data.hotel.id, clientId),
    );

    expect(statement.client.name).toBe('شركة الفجر');
    expect(statement.summary.invoiceCount).toBe(2);
    expect(statement.summary.totalInvoiced).toBe(2700);
    expect(statement.summary.totalPaid).toBe(1000);
    expect(statement.summary.outstandingBalance).toBe(1700);
    expect(statement.summary.overdueBalance).toBe(1200);
    expect(statement.invoices).toHaveLength(2);
  });
});

describe('Corporate Billing — multi-tenant isolation', () => {
  it('throws NotFoundError for another hotel client and invoice', async () => {
    const otherHotel = await prismaRaw.hotel.create({
      data: { id: 'other-hotel', name: 'Other Hotel', currency: 'LYD' },
    });
    const otherClient = await prismaRaw.externalClient.create({
      data: { hotelId: otherHotel.id, name: 'شركة أخرى' },
    });
    const otherInvoice = await prismaRaw.invoice.create({
      data: {
        hotelId: otherHotel.id,
        externalClientId: otherClient.id,
        invoiceNo: 'CORP-202603-9999',
        status: 'ISSUED',
        subtotal: 111,
        total: 111,
      },
    });

    await expect(
      asTenant(data.hotel.id, () => service.getClientStatement(data.hotel.id, otherClient.id)),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      asTenant(data.hotel.id, () =>
        service.recordInvoicePayment({
          hotelId: data.hotel.id,
          invoiceId: otherInvoice.id,
          amount: 10,
          method: 'CASH',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Corporate Billing — status guard', () => {
  it('exposes only the canonical corporate invoice statuses', () => {
    expect(CORPORATE_INVOICE_STATUSES).toEqual(['DRAFT', 'ISSUED', 'PAID', 'VOID']);
  });
});
