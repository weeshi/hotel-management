import { prisma } from '@/lib/utils/prisma';
import { WebsiteSettingsInput } from '@hotel/shared';

export interface WebPriceBreakdown {
  nightlyRate: number;
  nights: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  bookingFee: number;
  total: number;
}

export class WebsiteSettingsService {
  async getSettings(hotelId: string) {
    let settings = await prisma.websiteSetting.findUnique({
      where: { hotelId },
    });

    if (!settings) {
      settings = await prisma.websiteSetting.create({
        data: { hotelId },
      });
    }

    return settings;
  }

  async updateSettings(hotelId: string, body: WebsiteSettingsInput) {
    const settings = await prisma.websiteSetting.upsert({
      where: { hotelId },
      update: {
        ...(body.isOnlineBookingEnabled !== undefined ? { isOnlineBookingEnabled: body.isOnlineBookingEnabled } : {}),
        ...(body.taxRate !== undefined ? { taxRate: body.taxRate } : {}),
        ...(body.bookingFee !== undefined ? { bookingFee: body.bookingFee } : {}),
        ...(body.discountPercent !== undefined ? { discountPercent: body.discountPercent } : {}),
        ...(body.confirmationCutoffHours !== undefined ? { confirmationCutoffHours: body.confirmationCutoffHours } : {}),
      },
      create: {
        hotelId,
        isOnlineBookingEnabled: body.isOnlineBookingEnabled ?? false,
        taxRate: body.taxRate ?? 0,
        bookingFee: body.bookingFee ?? 0,
        discountPercent: body.discountPercent ?? 0,
        confirmationCutoffHours: body.confirmationCutoffHours ?? 48,
      },
    });

    return settings;
  }

  async isOnlineBookingEnabled(hotelId: string): Promise<boolean> {
    const settings = await this.getSettings(hotelId);
    return settings.isOnlineBookingEnabled;
  }

  computeWebPricing(args: {
    nightlyRate: number;
    nights: number;
    taxRate?: number;
    bookingFee?: number;
    discountPercent?: number;
  }): WebPriceBreakdown {
    const { nightlyRate, nights, taxRate = 0, bookingFee = 0, discountPercent = 0 } = args;

    const subtotal = nightlyRate * nights;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableBase = subtotal - discountAmount;
    const taxAmount = (taxableBase * taxRate) / 100;
    const total = taxableBase + taxAmount + bookingFee;

    return {
      nightlyRate,
      nights,
      subtotal,
      discountPercent,
      discountAmount,
      taxRate,
      taxAmount,
      bookingFee,
      total: Math.round(total * 100) / 100,
    };
  }
}
