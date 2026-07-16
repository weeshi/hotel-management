import { prisma } from '@/lib/utils/prisma';

export type QueueJobType = 'SEND_EMAIL' | 'SEND_SMS';

export interface QueueJob {
  id?: string;
  type: QueueJobType;
  data: Record<string, any>;
  priority?: number;
}

export class QueueService {
  async add(job: QueueJob): Promise<string> {
    const notification = await prisma.notification.create({
      data: {
        hotelId: job.data.hotelId || 'system',
        bookingId: job.data.bookingId || undefined,
        type: job.type,
        event: job.type.toLowerCase().replace(/_/g, '.'),
        recipient: job.data.recipient || '',
        subject: job.data.subject || '',
        body: job.data.body || '',
        status: 'PENDING',
      },
    });
    return notification.id;
  }

  async processPending(): Promise<number> {
    const pending = await prisma.notification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    let processed = 0;
    for (const notif of pending) {
      try {
        if (notif.type === 'SEND_EMAIL') {
          await this.deliverEmail(notif);
        }

        await prisma.notification.update({
          where: { id: notif.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        processed++;
      } catch {
        await prisma.notification.update({
          where: { id: notif.id },
          data: { status: 'FAILED' },
        });
      }
    }

    return processed;
  }

  private async deliverEmail(notification: any): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[QUEUE] Email to ${notification.recipient}: ${notification.subject}`);
      console.log(`[QUEUE] Body: ${notification.body?.slice(0, 200)}`);
      return;
    }

    const { sendEmail } = await import('@/lib/gateways/email.gateway');
    await sendEmail({
      to: notification.recipient,
      subject: notification.subject || '',
      html: notification.body || '',
    });
  }
}

export const queueService = new QueueService();
