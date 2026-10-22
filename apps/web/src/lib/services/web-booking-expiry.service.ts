import { prisma, tenantTx } from '@/lib/utils/prisma';
import { runWithTenant } from '@/lib/tenant/runtime-context';
import { childLogger } from '@/lib/observability/logger';

const log = childLogger({ component: 'service', module: 'web-booking-expiry' });

/**
 * M4 — auto-expire unconfirmed web bookings per hotel
 * `confirmationCutoffHours`. Runs hourly on the reconcile queue.
 * The cross-tenant listing runs in PLATFORM mode; every mutation then runs in
 * the owning hotel's TENANT transaction (RLS-correct, atomic per booking).
 */
export async function runWebBookingExpiryScan(): Promise<{
  scannedHotels: number;
  expiredBookings: number;
}> {
  return runWithTenant({ mode: 'PLATFORM' }, async () => {
    const settings = await prisma.websiteSetting.findMany({
      where: { confirmationCutoffHours: { gt: 0 } },
      select: { hotelId: true, confirmationCutoffHours: true },
    });

    let expiredBookings = 0;

    for (const setting of settings) {
      const cutoff = new Date(
        Date.now() - setting.confirmationCutoffHours * 3600_000,
      );

      const expired = await runWithTenant(
        { mode: 'TENANT', hotelId: setting.hotelId },
        () =>
          tenantTx(async (tx) => {
            const staleBookings = await tx.booking.findMany({
              where: {
                hotelId: setting.hotelId,
                status: 'PENDING',
                source: 'WEBSITE',
                createdAt: { lt: cutoff },
                payments: { none: { status: 'SUCCEEDED' } },
              },
              include: { folio: true },
            });

            for (const booking of staleBookings) {
              await tx.booking.update({
                where: { id: booking.id },
                data: {
                  status: 'CANCELLED',
                  cancelledAt: new Date(),
                  cancellationReason: 'انتهاء مهلة التأكيد التلقائية',
                },
              });

              if (
                booking.folio &&
                booking.folio.status === 'ACTIVE' &&
                Number(booking.folio.totalPaid) === 0
              ) {
                await tx.folio.update({
                  where: { id: booking.folio.id },
                  data: { status: 'VOID' },
                });
              }

              await tx.auditLog.create({
                data: {
                  hotelId: setting.hotelId,
                  bookingId: booking.id,
                  action: 'AUTO_EXPIRE_WEB_BOOKING',
                  entity: 'Booking',
                  entityId: booking.id,
                  newValue: JSON.stringify({ status: 'CANCELLED' }),
                },
              });
            }

            return staleBookings.length;
          }),
      );

      expiredBookings += expired;
    }

    log.info(
      { scannedHotels: settings.length, expiredBookings },
      'Web booking expiry scan completed',
    );
    return { scannedHotels: settings.length, expiredBookings };
  });
}
