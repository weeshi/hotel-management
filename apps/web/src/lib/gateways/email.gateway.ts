interface Attachment {
  filename: string;
  content: string;
  contentType?: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: Attachment[];
}

interface EmailTemplateParams {
  guestName?: string;
  bookingNo?: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  roomNumbers?: string[];
  totalAmount?: number;
  currency?: string;
  status?: string;
}

function buildTemplate(params: EmailTemplateParams): string {
  const hotelName = params.hotelName || 'الفندق';
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#C9A84C;padding:20px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${hotelName}</h1>
      </td></tr>
      <tr><td style="padding:30px;">
        <p style="font-size:16px;color:#333;margin:0 0 16px;">مرحباً ${params.guestName || 'النزيل الكريم'}</p>
        ${params.bookingNo ? `<p style="font-size:14px;color:#666;margin:0 0 8px;">رقم الحجز: <strong style="color:#C9A84C;">${params.bookingNo}</strong></p>` : ''}
        ${params.checkIn ? `<p style="font-size:14px;color:#666;margin:0 0 4px;">تاريخ الوصول: ${params.checkIn}</p>` : ''}
        ${params.checkOut ? `<p style="font-size:14px;color:#666;margin:0 0 4px;">تاريخ المغادرة: ${params.checkOut}</p>` : ''}
        ${params.roomNumbers?.length ? `<p style="font-size:14px;color:#666;margin:0 0 4px;">الغرف: ${params.roomNumbers.join('، ')}</p>` : ''}
        ${params.totalAmount ? `<p style="font-size:16px;color:#333;margin:12px 0 0;border-top:1px solid #eee;padding-top:12px;">المبلغ: <strong style="color:#C9A84C;">${params.totalAmount} ${params.currency || 'د.ل'}</strong></p>` : ''}
        ${params.status === 'CANCELLED' ? `<p style="font-size:14px;color:#E74C3C;margin:12px 0 0;padding:10px;background:#fdf0ef;border-radius:8px;">تم إلغاء الحجز. سنتواصل معك بخصوص المبلغ المسترد.</p>` : ''}
        ${params.status === 'CHECKED_IN' ? `<p style="font-size:14px;color:#2ECC71;margin:12px 0 0;padding:10px;background:#eafaf1;border-radius:8px;">تم تسجيل الدخول بنجاح. نتمنى لك إقامة سعيدة!</p>` : ''}
        ${params.status === 'CHECKED_OUT' ? `<p style="font-size:14px;color:#333;margin:12px 0 0;padding:10px;background:#f8f8f8;border-radius:8px;">تم تسجيل المغادرة. نشكرك على إقامتك معنا.</p>` : ''}
      </td></tr>
      <tr><td style="background:#f8f8f8;padding:16px;text-align:center;font-size:12px;color:#999;">
        هذا بريد إلكتروني تلقائي — يرجى عدم الرد عليه.
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string }> {
  if (process.env.NODE_ENV === 'development' || !process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] To: ${params.to}`);
    console.log(`[EMAIL] Subject: ${params.subject}`);
    console.log(`[EMAIL] Body length: ${params.html.length} chars`);
    return { success: true, messageId: 'dev-mode' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from || 'noreply@hotel.local',
        to: params.to,
        subject: params.subject,
        html: params.html,
        attachments: params.attachments,
      }),
    });

    if (!res.ok) throw new Error(`Resend error: ${res.status}`);
    const data = await res.json();
    return { success: true, messageId: data.id };
  } catch (error: any) {
    console.error('[EMAIL] Failed:', error.message);
    return { success: false };
  }
}

export function buildBookingTemplate(type: string, params: EmailTemplateParams): { subject: string; html: string } {
  const subjects: Record<string, string> = {
    BOOKING_CONFIRMED: '✅ تم تأكيد حجزك',
    BOOKING_CANCELLED: '❌ تم إلغاء الحجز',
    CHECKED_IN: '🔑 تم تسجيل الدخول',
    CHECKED_OUT: '🚪 تم تسجيل المغادرة',
    PAYMENT_RECEIVED: '💳 تم استلام الدفعة',
    REMINDER_24H: '⏰ تذكير: غداً موعد وصولك',
  };

  const currentSubject = subjects[type] || 'إشعار من الفندق';

  return {
    subject: `${currentSubject} — ${params.hotelName || 'الفندق'}`,
    html: buildTemplate({ ...params }),
  };
}
