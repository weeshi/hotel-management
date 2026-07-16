import fs from 'fs';
import path from 'path';

interface InvoiceData {
  invoiceNo: string;
  folioId: string;
  hotelName: string;
  guestName: string;
  guestEmail?: string;
  rooms: { number: string; checkIn: string; checkOut: string; nightlyRate: number }[];
  transactions: { description: string; amount: number; taxAmount?: number; createdAt: string }[];
  totalCharges: number;
  totalPaid: number;
  balance: number;
  payments: { method: string; amount: number; createdAt: string; status: string }[];
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function dateLabel(d: string): string {
  return new Date(d).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
}

export class InvoicePdfService {
  async generate(data: InvoiceData): Promise<Buffer> {
    const fontPath = path.join(process.cwd(), 'public', 'fonts');

    const fonts = {
      Cairo: {
        normal: path.join(fontPath, 'Cairo-Regular.ttf'),
        bold: path.join(fontPath, 'Cairo-Bold.ttf'),
      },
    };

    const PdfPrinter = require('pdfmake/src/Printer').default;
    const printer = new PdfPrinter(fonts, null, null, null);

    const charges = data.transactions.filter((t) => t.amount > 0);
    const nonCharges = data.transactions.filter((t) => t.amount < 0);
    const discounts = nonCharges.filter((t) => /خصم|discount/i.test(t.description));
    const payments = nonCharges.filter((p) => !/خصم|discount/i.test(p.description));

    const dd: any = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      info: {
        title: `فاتورة ${data.invoiceNo}`,
        author: data.hotelName,
        subject: 'فاتورة فندقية',
      },
      defaultStyle: {
        font: 'Cairo',
        direction: 'rtl',
        fontSize: 10,
      },
      content: [
        // Header
        {
          columns: [
            { text: data.hotelName, style: 'hotelName', alignment: 'right' },
            { text: `فاتورة رقم: ${data.invoiceNo}\nالتاريخ: ${new Date().toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' })}`, alignment: 'left', style: 'invoiceMeta' },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#C9A84C' }], margin: [0, 8, 0, 12] },

        // Guest info
        {
          columns: [
            { text: `النزيل: ${data.guestName}`, bold: true },
            { text: data.guestEmail ? `البريد: ${data.guestEmail}` : '', alignment: 'left' },
          ],
          margin: [0, 0, 0, 4],
        },
        ...data.rooms.map(
          (r) =>
            ({
              text: `الغرفة ${r.number}: ${dateLabel(r.checkIn)} → ${dateLabel(r.checkOut)} (${r.nightlyRate} د.ل/ليلة)`,
              fontSize: 9,
              color: '#666666',
              margin: [0, 0, 0, 2],
            } as any)
        ),

        // Charges table
        { text: 'الرسوم', style: 'sectionTitle', margin: [0, 16, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto'],
            body: [
              [
                { text: 'البيان', style: 'tableHeader', alignment: 'right' },
                { text: 'الضريبة', style: 'tableHeader', alignment: 'center' },
                { text: 'المبلغ', style: 'tableHeader', alignment: 'left' },
              ],
              ...charges.map((t) => [
                { text: t.description, alignment: 'right' },
                { text: (t.taxAmount || 0) > 0 ? fmt(t.taxAmount || 0) : '—', alignment: 'center', color: '#666666', fontSize: 9 },
                { text: `${fmt(t.amount)} د.ل`, alignment: 'left', bold: true },
              ]),
            ],
          },
          layout: 'headerLineOnly',
          margin: [0, 0, 0, 8],
        },

        // Discounts
        ...(discounts.length > 0
          ? [
              { text: 'الخصومات', style: 'sectionTitle', margin: [0, 8, 0, 4] } as any,
              ...discounts.map(
                (d) =>
                  ({
                    text: `${d.description}: -${fmt(Math.abs(d.amount))} د.ل`,
                    color: '#27AE60',
                    margin: [0, 0, 0, 2],
                  } as any)
              ),
            ]
          : []),

        // Totals
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }], margin: [0, 8, 0, 4] },
        { text: `إجمالي الرسوم: ${fmt(data.totalCharges)} د.ل`, alignment: 'left', margin: [0, 0, 0, 2] },
        { text: `المدفوع: -${fmt(data.totalPaid)} د.ل`, color: '#27AE60', alignment: 'left', margin: [0, 0, 0, 2] },
        ...(discounts.length > 0 ? [{ text: `الخصم: -${fmt(discounts.reduce((s, d) => s + Math.abs(d.amount), 0))} د.ل`, color: '#27AE60', alignment: 'left', margin: [0, 0, 0, 2] }] : []),
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#C9A84C' }], margin: [0, 4, 0, 4] },
        { text: `الرصيد: ${fmt(data.balance)} د.ل`, style: 'balance', alignment: 'left', margin: [0, 0, 0, 12] },

        // Payment history
        ...(payments.length > 0
          ? [
              { text: 'سجل المدفوعات', style: 'sectionTitle', margin: [0, 8, 0, 4] } as any,
              {
                table: {
                  headerRows: 1,
                  widths: ['*', 'auto', 'auto'],
                  body: [
                    [
                      { text: 'طريقة الدفع', style: 'tableHeader' },
                      { text: 'التاريخ', style: 'tableHeader', alignment: 'center' },
                      { text: 'المبلغ', style: 'tableHeader', alignment: 'left' },
                    ],
                    ...payments.map((p) => [
                      { text: p.description },
                      { text: dateLabel(p.createdAt), alignment: 'center', fontSize: 9 },
                      { text: `${fmt(Math.abs(p.amount))} د.ل`, alignment: 'left', bold: true },
                    ]),
                  ],
                },
                layout: 'headerLineOnly',
                margin: [0, 0, 0, 8],
              },
            ]
          : []),

        // Footer
        { text: `${data.hotelName} — شكراً لاختياركم إقامتكم لدينا`, style: 'footer', margin: [0, 20, 0, 0] },
      ],
      styles: {
        hotelName: { fontSize: 16, bold: true, color: '#C9A84C' },
        invoiceMeta: { fontSize: 8, color: '#999999' },
        sectionTitle: { fontSize: 11, bold: true, color: '#333333' },
        tableHeader: { fontSize: 9, bold: true, color: '#666666', fillColor: '#F8F8F8' },
        balance: { fontSize: 14, bold: true, color: '#C9A84C' },
        footer: { fontSize: 9, color: '#999999', alignment: 'center' },
      },
    };

    return new Promise<Buffer>((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(dd);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
