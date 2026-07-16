import path from 'path';

interface ReceiptData {
  receiptNo: string;
  hotelName: string;
  guestName: string;
  guestPhone?: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  method?: string;
  description?: string;
  balanceBefore: number;
  balanceAfter: number;
  createdBy: string;
  createdAt: Date;
}

const methodLabels: Record<string, string> = {
  CASH: 'نقداً',
  TRANSFER: 'حوالة بنكية',
  CARD: 'بطاقة',
  CHEQUE: 'شيك',
};

const typeLabels: Record<string, string> = {
  DEPOSIT: 'إيداع',
  WITHDRAWAL: 'سحب',
};

function fmt(n: number): string {
  return n.toFixed(2);
}

export class WalletReceiptPdfService {
  async generate(data: ReceiptData): Promise<Buffer> {
    const fontPath = path.join(process.cwd(), 'public', 'fonts');

    const fonts = {
      Cairo: {
        normal: path.join(fontPath, 'Cairo-Regular.ttf'),
        bold: path.join(fontPath, 'Cairo-Bold.ttf'),
      },
    };

    const PdfPrinter = require('pdfmake/src/Printer').default;
    const printer = new PdfPrinter(fonts, null, null, null);

    const dd: any = {
      pageSize: { width: 320, height: 'auto' },
      pageMargins: [16, 16, 16, 16],
      info: {
        title: `إيصال ${typeLabels[data.type]} - ${data.receiptNo}`,
        author: data.hotelName,
      },
      content: [
        {
          columns: [
            { text: data.hotelName, style: 'hotelName', alignment: 'right', width: '*' },
          ],
        },
        { text: typeLabels[data.type] === 'إيداع' ? '💰 إيصال إيداع' : '💰 إيصال سحب', style: 'title', alignment: 'center' },
        { text: `رقم الإيصال: ${data.receiptNo}`, style: 'receiptNo', alignment: 'center', margin: [0, 4, 0, 12] },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 288, y2: 0, lineWidth: 1, lineColor: '#D4AF37' }],
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              ['النزيل', { text: data.guestName, alignment: 'left' }],
              ...(data.guestPhone ? [['الهاتف', { text: data.guestPhone, alignment: 'left' }]] : []),
              ['التاريخ', { text: data.createdAt.toLocaleString('ar-LY'), alignment: 'left' }],
              ['نوع العملية', { text: typeLabels[data.type] || data.type, alignment: 'left' }],
              ['طريقة الدفع', { text: methodLabels[data.method || ''] || '—', alignment: 'left' }],
              ['الرصيد قبل', { text: `${fmt(data.balanceBefore)} د.ل`, alignment: 'left' }],
              ['المبلغ', { text: `${fmt(data.amount)} د.ل`, alignment: 'left', color: data.type === 'DEPOSIT' ? '#16A34A' : '#DC2626', bold: true }],
              ['الرصيد بعد', { text: `${fmt(data.balanceAfter)} د.ل`, alignment: 'left', bold: true }],
              ...(data.description ? [['البيان', { text: data.description, alignment: 'left' }]] : []),
              ['أصدرها', { text: data.createdBy, alignment: 'left' }],
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 288, y2: 0, lineWidth: 1, lineColor: '#D4AF37' }],
          margin: [0, 12, 0, 8],
        },
        { text: 'شكراً لثقتكم', style: 'footer', alignment: 'center' },
        { text: 'نظام إدارة الفنادق', style: 'footerSub', alignment: 'center' },
      ],
      styles: {
        hotelName: { fontSize: 14, bold: true, color: '#D4AF37', margin: [0, 0, 0, 4] },
        title: { fontSize: 12, bold: true, color: '#1F2937', margin: [0, 4, 0, 4] },
        receiptNo: { fontSize: 9, color: '#6B7280' },
        footer: { fontSize: 10, color: '#D4AF37', margin: [0, 4, 0, 2] },
        footerSub: { fontSize: 8, color: '#9CA3AF' },
      },
    };

    const pdf = printer.createPdfKitDocument(dd);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  }
}
