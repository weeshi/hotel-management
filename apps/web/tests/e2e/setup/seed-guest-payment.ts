import { PrismaClient } from '@prisma/client';
import { E2E, APP_BASE, DUMMY_BASE } from './env';
import { CONTRACT_SECRETS, ContractGateway } from '../../contracts/shared/signer';
import { encryptSecret } from '../../../src/lib/utils/crypto';

// The E2E app process boots with PAYMENT_CRYPTO_KEY = E2E.paymentCryptoKey
// (see env.ts APP_ENV). The Playwright *test* process does not inherit that env,
// so we re-pin the same test-only key here before encryptSecret() is ever invoked
// (crypto.getEncryptionKey() reads process.env lazily at call time).
process.env.PAYMENT_CRYPTO_KEY = E2E.paymentCryptoKey;

export interface SeededBookingContext {
  hotelId: string;
  bookingId: string;
  guestId: string;
}

export interface SeedGuestBookingOptions {
  /** Folio outstanding balance (the amount the webhook must settle to zero). */
  amount?: number;
  nights?: number;
  nightlyRate?: number;
  /** Gateway engine to wire through IntegrationConfig (defaults to 'plutu'). */
  gateway?: ContractGateway;
}

/**
 * Seeds the full, realistic guest-booking tree for E2E.2:
 *
 *   Hotel → RoomType → Room → Guest → Booking → BookingRoom → Folio
 *                            └→ IntegrationConfig (gateway · DB-sourced)
 *
 * The gateway is wired through the production path: an `IntegrationConfig` row
 * (kind=PAYMENT_GATEWAY, engine={gateway}, isActive) whose `apiKeyEnc` carries the
 * encrypted { merchantId, secretKey } contract bundle and whose `config` overlay
 * points the gateway at the E2E dummy. This exercises `resolveGatewayConfig`
 * source='db' and lets a forged webhook be rejected against the secret stored in
 * the DB rather than the platform env fallback.
 *
 * State isolation is by unique data, never by truncation — each call creates a
 * fresh hotel/booking so nothing leaks across tests or scenarios.
 */
export async function seedGuestBooking(
  prisma: PrismaClient,
  opts: SeedGuestBookingOptions = {},
): Promise<SeededBookingContext> {
  const gateway = opts.gateway ?? 'plutu';
  const amount = opts.amount ?? 250;
  const nights = opts.nights ?? 2;
  const nightlyRate = opts.nightlyRate ?? amount / nights;
  const stamp = Date.now();
  const secrets = CONTRACT_SECRETS[gateway];

  const hotel = await prisma.hotel.create({
    data: {
      name: `E2E ${gateway === 'tlync' ? 'T-Lync' : 'Plutu'} Hotel ${stamp}`,
      currency: 'LYD',
      timezone: 'Asia/Tripoli',
    },
  });

  const roomType = await prisma.roomType.create({
    data: {
      hotelId: hotel.id,
      name: `Standard ${stamp}`,
      baseRate: nightlyRate,
      capacity: 2,
      isWebVisible: true,
    },
  });

  const room = await prisma.room.create({
    data: {
      hotelId: hotel.id,
      roomNumber: '101',
      roomTypeId: roomType.id,
      status: 'AVAILABLE',
      housekeepingStatus: 'CLEAN',
    },
  });

  const guest = await prisma.guest.create({
    data: {
      hotelId: hotel.id,
      name: `E2E Guest ${stamp}`,
      email: `guest_${stamp}@e2e.example.ly`,
      phone: `20${String(stamp).slice(-8)}`,
    },
  });

  const checkIn = new Date(stamp + 24 * 60 * 60 * 1000);
  const checkOut = new Date(checkIn.getTime() + nights * 24 * 60 * 60 * 1000);

  const booking = await prisma.booking.create({
    data: {
      bookingNo: `E2E-${gateway === 'tlync' ? 'TLYNC' : 'PLUTU'}-${stamp}`,
      hotelId: hotel.id,
      guestId: guest.id,
      guestName: guest.name,
      guestEmail: guest.email,
      guestPhone: guest.phone,
      status: 'PENDING',
      source: 'WEBSITE',
      adults: 2,
      children: 0,
      webTotalAmount: amount,
    },
  });

  await prisma.bookingRoom.create({
    data: {
      bookingId: booking.id,
      roomId: room.id,
      roomTypeId: roomType.id,
      nightlyRate,
      checkIn,
      checkOut,
    },
  });

  await prisma.folio.create({
    data: {
      hotelId: hotel.id,
      bookingId: booking.id,
      status: 'ACTIVE',
      totalCharges: amount,
      totalPaid: 0,
      balance: amount,
    },
  });

  await prisma.integrationConfig.create({
    data: {
      hotelId: hotel.id,
      engine: gateway,
      kind: 'PAYMENT_GATEWAY',
      isActive: true,
      apiKeyEnc: encryptSecret(
        JSON.stringify({
          merchantId: secrets.merchantId,
          secretKey: secrets.secretKey,
        }),
      ),
      config: JSON.stringify({
        baseUrl: DUMMY_BASE,
        returnUrl: `${APP_BASE}/booking/${booking.id}/checkout?step=success`,
        callbackUrl: `${APP_BASE}/api/external/gateways/${gateway}/webhook`,
      }),
    },
  });

  return { hotelId: hotel.id, bookingId: booking.id, guestId: guest.id };
}