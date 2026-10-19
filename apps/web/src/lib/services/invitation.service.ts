import { randomBytes, createHash } from 'crypto';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { hashPassword } from '@/lib/utils/password';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { createAuditLog } from './audit.service';
import { runWithTenant } from '@/lib/tenant/runtime-context';

const INVITATION_TTL_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

async function resolveValidInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { hotel: { select: { name: true } } },
  });
  if (!invitation) throw new NotFoundError('رمز الدعوة غير صالح');
  if (invitation.isUsed) throw new ValidationError('رمز الدعوة مستخدم مسبقاً');
  if (invitation.expiresAt < new Date()) {
    throw new ValidationError('انتهت صلاحية الدعوة، يرجى طلب رابط جديد');
  }
  return invitation;
}

export class InvitationService {
  /**
   * M8 — invitations resolve against & create rows across tenants (a brand-new
   * hotel has no RLS session yet), so every public method runs as app_platform.
   */
  private platform<T>(fn: () => Promise<T>): Promise<T> {
    return runWithTenant({ mode: 'PLATFORM' }, fn);
  }

  async createHotelWithInvitation(params: {
    hotel: {
      name: string;
      nameAr?: string;
      customDomain?: string | null;
      address?: string;
      phone?: string;
      email?: string;
      currency?: string;
      checkInTime?: string;
      checkOutTime?: string;
    };
    manager: { email: string; name?: string };
    createdById: string;
  }) {
    return this.platform(async () => {
    const { hotel: hotelData, manager, createdById } = params;

    const existingEmail = await prisma.user.findUnique({
      where: { email: manager.email.toLowerCase() },
      select: { id: true },
    });
    if (existingEmail) {
      throw new ValidationError('البريد الإلكتروني مستخدم مسبقاً');
    }

    if (hotelData.customDomain) {
      const existingDomain = await prisma.hotel.findUnique({
        where: { customDomain: hotelData.customDomain },
        select: { id: true },
      });
      if (existingDomain) {
        throw new ValidationError('اسم النطاق مستخدم مسبقاً');
      }
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    let result: {
      hotel: { id: string; name: string };
      invitation: { id: string; email: string; role: string; expiresAt: Date };
    };

    try {
      result = await tenantTx(async (tx) => {
        const hotel = await tx.hotel.create({
          data: {
            name: hotelData.name,
            nameAr: hotelData.nameAr,
            customDomain: hotelData.customDomain || null,
            address: hotelData.address,
            phone: hotelData.phone,
            email: hotelData.email,
            currency: hotelData.currency || 'LYD',
            checkInTime: hotelData.checkInTime || '14:00',
            checkOutTime: hotelData.checkOutTime || '12:00',
          },
        });

        const invitation = await tx.invitation.create({
          data: {
            tokenHash: hashToken(token),
            email: manager.email.toLowerCase(),
            name: manager.name,
            hotelId: hotel.id,
            role: 'MANAGER',
            createdById,
            expiresAt,
          },
        });

        return { hotel, invitation };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ValidationError('اسم النطاق أو البريد الإلكتروني مستخدم مسبقاً');
      }
      throw error;
    }

    await createAuditLog({
      hotelId: result.hotel.id,
      userId: createdById,
      action: 'HOTEL_CREATED',
      entity: 'HOTEL',
      entityId: result.hotel.id,
      newValue: JSON.stringify({ name: result.hotel.name }),
    });
    await createAuditLog({
      hotelId: result.hotel.id,
      userId: createdById,
      action: 'INVITATION_CREATED',
      entity: 'INVITATION',
      entityId: result.invitation.id,
      newValue: JSON.stringify({ email: result.invitation.email, role: result.invitation.role }),
    });

    return {
      hotel: { id: result.hotel.id, name: result.hotel.name },
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
      },
      token,
    };
    });
  }

  async validateToken(token: string) {
    return this.platform(async () => {
    const invitation = await resolveValidInvitation(token);
    return {
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      hotelName: invitation.hotel.name,
      expiresAt: invitation.expiresAt,
    };
    });
  }

  async acceptInvitation(params: {
    token: string;
    name: string;
    password: string;
    phone?: string;
  }) {
    return this.platform(async () => {
    const { token, name, password, phone } = params;
    const invitation = await resolveValidInvitation(token);

    const existingEmail = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existingEmail) {
      throw new ValidationError('البريد الإلكتروني مستخدم مسبقاً');
    }

    const hashedPassword = await hashPassword(password);

    const user = await tenantTx(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          name,
          phone,
          role: invitation.role,
          hotelId: invitation.hotelId,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          hotelId: true,
          isActive: true,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { isUsed: true, usedAt: new Date() },
      });

      return created;
    });

    await createAuditLog({
      hotelId: invitation.hotelId,
      userId: user.id,
      action: 'INVITATION_ACCEPTED',
      entity: 'USER',
      entityId: user.id,
      newValue: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
    });

    return user;
    });
  }
}
