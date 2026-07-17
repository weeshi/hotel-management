import { prisma } from './prisma';

export function toCsv(data: any[], keyLabels: Record<string, string>): string {
  const keys = Object.keys(keyLabels);
  const header = keys.map(k => `"${keyLabels[k]}"`).join(',');
  const rows = data.map(row =>
    keys.map(k => {
      const val = row[k];
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return `${header}\n${rows.join('\n')}`;
}

export function buildPrintHtml(title: string, tables: { label: string; headers: string[]; rows: string[][] }[], settings: any, hotelName: string): string {
  const logoHtml = settings?.logoUrl ? `<img src="${settings.logoUrl}" style="max-height:80px;margin-bottom:12px;" />` : '';
  const headerHtml = settings?.headerText ? `<div style="font-size:18px;font-weight:bold;margin-bottom:4px;">${settings.headerText}</div>` : '';
  const footerHtml = settings?.footerText ? `<div style="margin-top:40px;padding-top:12px;border-top:1px solid #ccc;font-size:12px;color:#666;">${settings.footerText}</div>` : '';
  const taxHtml = settings?.taxNumber ? `<div style="font-size:12px;color:#666;">الرقم الضريبي: ${settings.taxNumber}</div>` : '';

  const tablesHtml = tables.map(t => `
    <div style="margin-bottom:24px;">
      <h3 style="color:#C9A84C;margin-bottom:8px;border-bottom:2px solid #C9A84C;padding-bottom:4px;">${t.label}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;">
            ${t.headers.map(h => `<th style="padding:8px 10px;border:1px solid #ddd;text-align:right;font-weight:bold;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${t.rows.map(row => `<tr>${row.map(c => `<td style="padding:6px 10px;border:1px solid #ddd;">${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Segoe UI',sans-serif;padding:40px;color:#333;max-width:1100px;margin:auto;}@media print{body{padding:20px;}}</style></head><body>
    <div style="text-align:center;margin-bottom:24px;">${logoHtml}${headerHtml}<h1 style="font-size:22px;margin:4px 0;">${title}</h1><div style="font-size:13px;color:#666;">${hotelName} | ${new Date().toLocaleDateString('ar-LY')}</div>${taxHtml}</div>
    ${tablesHtml}
    ${footerHtml}
    <div style="margin-top:30px;padding-top:10px;border-top:1px solid #ddd;font-size:11px;color:#999;text-align:center;">تم إنشاء التقرير في ${new Date().toLocaleString('ar-LY')}</div>
  </body></html>`;
}

export async function fetchReportData(type: string, hotelId: string, dateFrom?: string, dateTo?: string) {
  const dateFilter = {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(dateTo) } : {}),
  };
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  switch (type) {
    case 'occupancy': {
      const rooms = await prisma.room.findMany({
        where: { hotelId },
        include: { roomType: true, bookingRooms: { where: { booking: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } } }, include: { booking: true } } },
      });
      const total = rooms.length;
      const occupied = rooms.filter(r => r.bookingRooms.some(br => ['CONFIRMED', 'CHECKED_IN'].includes(br.booking.status))).length;
      return {
        title: 'تقرير الإشغال',
        tables: [
          { label: 'ملخص', headers: ['المجموع', 'مشغول', 'متاح', 'نسبة الإشغال'], rows: [[String(total), String(occupied), String(total - occupied), total ? `${Math.round((occupied / total) * 100)}%` : '0%']] },
          { label: 'حسب نوع الغرفة', headers: ['النوع', 'المجموع', 'مشغول', 'النسبة'], rows: Object.entries(rooms.reduce((acc: any, r) => { const k = r.roomTypeId; if (!acc[k]) acc[k] = { name: r.roomType?.name || '', total: 0, occupied: 0 }; acc[k].total++; if (r.bookingRooms.some(br => ['CONFIRMED', 'CHECKED_IN'].includes(br.booking.status))) acc[k].occupied++; return acc; }, {})).map(([_, d]: any) => [d.name, String(d.total), String(d.occupied), d.total ? `${Math.round((d.occupied / d.total) * 100)}%` : '0%']) },
        ],
        flatData: rooms.map(r => ({ roomNumber: r.roomNumber, type: r.roomType?.name || '', floor: r.floor, status: r.bookingRooms.some(br => ['CONFIRMED', 'CHECKED_IN'].includes(br.booking.status)) ? 'مشغول' : 'متاح' })),
        keyLabels: { roomNumber: 'رقم الغرفة', type: 'النوع', floor: 'الطابق', status: 'الحالة' },
      };
    }
    case 'revenue': {
      const paymentAgg = await prisma.payment.aggregate({ where: { booking: { hotelId }, status: 'SUCCEEDED', ...(hasDateFilter ? { createdAt: dateFilter } : {}) }, _sum: { amount: true } });
      const discountsAgg = await prisma.folioDiscount.aggregate({ where: { folio: { booking: { hotelId } }, ...(hasDateFilter ? { createdAt: dateFilter } : {}) }, _sum: { amount: true } });
      const totalRev = paymentAgg._sum.amount || 0;
      const totalDisc = discountsAgg._sum.amount || 0;
      const payments = await prisma.payment.findMany({ where: { booking: { hotelId }, status: 'SUCCEEDED', ...(hasDateFilter ? { createdAt: dateFilter } : {}) }, select: { amount: true, method: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
      return {
        title: 'تقرير الإيرادات',
        tables: [
          { label: 'ملخص', headers: ['إجمالي الإيرادات', 'الخصومات', 'الصافي', 'عدد المعاملات'], rows: [[String(totalRev), String(totalDisc), String(totalRev - totalDisc), String(payments.length)]] },
          { label: 'طرق الدفع', headers: ['الطريقة', 'المبلغ', 'العدد'], rows: Object.entries(payments.reduce((acc: any, p) => { if (!acc[p.method]) acc[p.method] = { total: 0, count: 0 }; acc[p.method].total += p.amount; acc[p.method].count++; return acc; }, {})).map(([method, d]: any) => [method, String(d.total), String(d.count)]) },
        ],
        flatData: payments.map(p => ({ method: p.method, amount: p.amount, date: p.createdAt.toISOString().split('T')[0] })),
        keyLabels: { method: 'طريقة الدفع', amount: 'المبلغ', date: 'التاريخ' },
      };
    }
    case 'housekeeping': {
      const where = { hotelId, ...(hasDateFilter ? { createdAt: dateFilter } : {}) };
      const tasks = await prisma.housekeepingTask.findMany({ where, select: { status: true, priority: true, taskType: true, assignedTo: true, createdAt: true } });
      const byStatus = tasks.reduce((acc: any, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
      const completed = byStatus['COMPLETED'] || 0;
      return {
        title: 'تقرير التدبير المنزلي',
        tables: [
          { label: 'ملخص', headers: ['المجموع', 'مكتمل', 'قيد الانتظار', 'نسبة الإنجاز'], rows: [[String(tasks.length), String(completed), String(tasks.length - completed), tasks.length ? `${Math.round((completed / tasks.length) * 100)}%` : '0%']] },
          { label: 'حسب الحالة', headers: ['الحالة', 'العدد'], rows: Object.entries(byStatus).map(([k, v]) => [k, String(v)]) },
        ],
        flatData: tasks.map(t => ({ status: t.status, priority: t.priority, taskType: t.taskType, assignedTo: t.assignedTo || '' })),
        keyLabels: { status: 'الحالة', priority: 'الأولوية', taskType: 'النوع', assignedTo: 'الموظف' },
      };
    }
    case 'restaurant': {
      const where = { hotelId, ...(hasDateFilter ? { createdAt: dateFilter } : {}) };
      const orders = await prisma.restaurantOrder.findMany({ where, select: { orderNo: true, orderType: true, status: true, totalAmount: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
      const totalRev = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      return {
        title: 'تقرير المطعم',
        tables: [
          { label: 'ملخص', headers: ['عدد الطلبات', 'إجمالي الإيرادات', 'متوسط الطلب'], rows: [[String(orders.length), String(totalRev), orders.length ? String(Math.round((totalRev / orders.length) * 100) / 100) : '0']] },
          { label: 'حسب النوع', headers: ['النوع', 'العدد'], rows: Object.entries(orders.reduce((acc: any, o) => { acc[o.orderType] = (acc[o.orderType] || 0) + 1; return acc; }, {})).map(([k, v]) => [k, String(v)]) },
        ],
        flatData: orders.map(o => ({ orderNo: o.orderNo, type: o.orderType, status: o.status, amount: o.totalAmount })),
        keyLabels: { orderNo: 'رقم الطلب', type: 'النوع', status: 'الحالة', amount: 'المبلغ' },
      };
    }
    case 'safe-deposit': {
      const where = { hotelId, ...(hasDateFilter ? { openedAt: dateFilter } : {}) };
      const boxes = await prisma.safeDepositBox.findMany({
        where, select: {
          status: true, roomId: true, openedAt: true,
          booking: { select: { guest: { select: { name: true } } } },
          externalClient: { select: { name: true } },
        },
      });
      const active = boxes.filter(b => b.status === 'ACTIVE').length;
      const closed = boxes.filter(b => b.status === 'CLOSED').length;
      return {
        title: 'تقرير صناديق الأمانات',
        tables: [
          { label: 'ملخص', headers: ['المجموع', 'نشط', 'مغلق'], rows: [[String(boxes.length), String(active), String(closed)]] },
        ],
        flatData: boxes.map(b => ({
          guestName: b.booking?.guest?.name || b.externalClient?.name || '—',
          status: b.status === 'ACTIVE' ? 'نشط' : 'مغلق',
          date: b.openedAt.toISOString().split('T')[0],
        })),
        keyLabels: { guestName: 'اسم النزيل', status: 'الحالة', date: 'تاريخ الفتح' },
      };
    }
    case 'lost-found': {
      const where = { hotelId, ...(hasDateFilter ? { createdAt: dateFilter } : {}) };
      const items = await prisma.lostItem.findMany({ where, select: { description: true, status: true, locationFound: true, createdAt: true, claimedAt: true }, orderBy: { createdAt: 'desc' } });
      const pending = items.filter(i => i.status === 'PENDING').length;
      const claimed = items.filter(i => i.status === 'CLAIMED').length;
      return {
        title: 'تقرير المفقودات',
        tables: [
          { label: 'ملخص', headers: ['المجموع', 'قيد الانتظار', 'مستلم', 'معدل الاستلام'], rows: [[String(items.length), String(pending), String(claimed), items.length ? `${Math.round((claimed / items.length) * 100)}%` : '0%']] },
        ],
        flatData: items.map(i => ({ description: i.description, status: i.status === 'PENDING' ? 'قيد الانتظار' : i.status === 'CLAIMED' ? 'مستلم' : 'مصرف', location: i.locationFound, date: i.createdAt.toISOString().split('T')[0] })),
        keyLabels: { description: 'الوصف', status: 'الحالة', location: 'مكان العثور', date: 'التاريخ' },
      };
    }
    default:
      throw new Error('نوع التقرير غير مدعوم');
  }
}
