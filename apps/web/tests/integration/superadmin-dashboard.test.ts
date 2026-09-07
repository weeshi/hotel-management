import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { InvitationService } from '@/lib/services/invitation.service';
import { GET as hotelsGET, POST as hotelsPOST } from '@/app/api/superadmin/hotels/route';
import { GET as invitationsGET } from '@/app/api/superadmin/invitations/route';
import { POST as resendPOST } from '@/app/api/superadmin/invitations/[id]/resend/route';
import { GET as validateGET } from '@/app/api/auth/invitations/[token]/route';

const invitationService = new InvitationService();

let data: Awaited<ReturnType<typeof seedTestData>>;
let superAdmin: { id: string };
const BASE_URL = 'http://localhost';

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
  superAdmin = await prisma.user.create({
    data: {
      email: 'super@platform.com',
      password: 'hashed',
      name: 'Super Admin',
      role: 'SUPER_ADMIN' as Role,
    },
  });
});

afterAll(async () => {
  await closeDb();
});

async function authRequest(userId: string, role: string, init: RequestInit = {}) {
  const token = await signAccessToken({ userId, role });
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return new NextRequest(BASE_URL, {
    method: init.method,
    headers,
    body: init.body as BodyInit | null,
  });
}

function csrfHeaders(token: string) {
  return { cookie: `csrf-token=${token}`, 'x-csrf-token': token };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('Super-Admin Dashboard — GET /api/superadmin/hotels', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await hotelsGET(new NextRequest(BASE_URL), {});
    expect(res.status).toBe(401);
  });

  it('rejects non-super-admin roles with 403', async () => {
    const req = await authRequest(data.admin.id, 'ADMIN', { method: 'GET' });
    const res = await hotelsGET(req, {});
    expect(res.status).toBe(403);
  });

  it('returns hotels with customDomain, createdAt and invitation counts', async () => {
    await prisma.hotel.create({
      data: {
        name: 'فندق السلام',
        customDomain: 'daralsalam.ly',
      },
    });
    const invitationResult = await invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق النخيل', customDomain: 'nakheel.ly' },
      manager: { email: 'manager@nakheel.ly' },
      createdById: superAdmin.id,
    });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', { method: 'GET' });
    const res = await hotelsGET(req, {});
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.success).toBe(true);

    const byName = new Map<string, any>(
      body.data.map((h: any) => [h.name, h] as [string, any])
    );
    expect(byName.get('فندق النخيل').customDomain).toBe('nakheel.ly');
    expect(byName.get('فندق النخيل').createdAt).toBeTruthy();
    expect(byName.get('فندق النخيل').invitationsPending).toBe(1);
    expect(byName.get('فندق السلام').customDomain).toBe('daralsalam.ly');
    expect(byName.get('فندق السلام').invitationsPending).toBe(0);
    expect(byName.get('Test Hotel')).toBeTruthy();
  });
});

describe('Super-Admin Dashboard — GET /api/superadmin/invitations', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await invitationsGET(new NextRequest(BASE_URL), {});
    expect(res.status).toBe(401);
  });

  it('rejects non-super-admin roles with 403', async () => {
    const req = await authRequest(data.receptionist.id, 'RECEPTION', { method: 'GET' });
    const res = await invitationsGET(req, {});
    expect(res.status).toBe(403);
  });

  it('lists invitations with computed status (pending, expired, used)', async () => {
    const pending = await invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق المعلق' },
      manager: { email: 'pending@hotel.com' },
      createdById: superAdmin.id,
    });

    const expired = await invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق المنتهي' },
      manager: { email: 'expired@hotel.com' },
      createdById: superAdmin.id,
    });
    await prisma.invitation.update({
      where: { id: expired.invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const used = await invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق المستخدم' },
      manager: { email: 'used@hotel.com' },
      createdById: superAdmin.id,
    });
    await prisma.invitation.update({
      where: { id: used.invitation.id },
      data: { isUsed: true, usedAt: new Date() },
    });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', { method: 'GET' });
    const res = await invitationsGET(req, {});
    expect(res.status).toBe(200);

    const body: any = await res.json();
    const byEmail = new Map<string, any>(
      body.data.map((i: any) => [i.email, i] as [string, any])
    );
    expect(byEmail.get('pending@hotel.com').status).toBe('PENDING');
    expect(byEmail.get('expired@hotel.com').status).toBe('EXPIRED');
    expect(byEmail.get('used@hotel.com').status).toBe('USED');
    expect(byEmail.get('pending@hotel.com').hotel.name).toBe('فندق المعلق');
  });
});

describe('Super-Admin Dashboard — POST /api/superadmin/invitations/[id]/resend', () => {
  async function createPendingInvitation(email: string) {
    return invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق الإعادة', customDomain: 'resend.ly' },
      manager: { email },
      createdById: superAdmin.id,
    });
  }

  it('rejects unauthenticated requests with 401', async () => {
    const res = await resendPOST(new NextRequest(BASE_URL, { method: 'POST' }), { params: { id: 'x' } });
    expect(res.status).toBe(401);
  });

  it('rejects non-super-admin roles with 403', async () => {
    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-rs-1'),
    });
    const res = await resendPOST(req, { params: { id: '00000000-0000-0000-0000-000000000000' } });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown invitation id', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-rs-2'),
    });
    const res = await resendPOST(req, { params: { id: '00000000-0000-0000-0000-000000000000' } });
    expect(res.status).toBe(404);
  });

  it('regenerates the token hash and expiry, returns a fresh SaaS link', async () => {
    const { invitation, token: oldToken } = await createPendingInvitation('resend@hotel.com');

    const oldRecord = await prisma.invitation.findUnique({ where: { id: invitation.id } });
    expect(oldRecord?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-rs-3'),
    });
    const res = await resendPOST(req, { params: { id: invitation.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.invitationLink).toContain('/auth/invitation?token=');
    expect(body.data.invitationLink).toContain('domain=resend.ly');

    const newToken = new URL(body.data.invitationLink).searchParams.get('token')!;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    const updated = await prisma.invitation.findUnique({ where: { id: invitation.id } });
    expect(updated?.tokenHash).toBe(hashToken(newToken));
    expect(updated?.tokenHash).not.toBe(hashToken(oldToken));
    expect(updated?.expiresAt.getTime()).toBeGreaterThan(oldRecord!.expiresAt.getTime());
    expect(updated?.isUsed).toBe(false);

    // The old token is dead; the new one is valid
    const oldValidate = await validateGET(new NextRequest(BASE_URL), { params: { token: oldToken } });
    expect(oldValidate.status).toBe(404);
    const newValidate = await validateGET(new NextRequest(BASE_URL), { params: { token: newToken } });
    expect(newValidate.status).toBe(200);
  });

  it('refreshes an expired invitation', async () => {
    const { invitation } = await createPendingInvitation('expired-resend@hotel.com');
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-rs-4'),
    });
    const res = await resendPOST(req, { params: { id: invitation.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.invitationLink).toContain('/auth/invitation?token=');

    const updated = await prisma.invitation.findUnique({ where: { id: invitation.id } });
    expect(updated?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects resending a used invitation with 422', async () => {
    const { invitation } = await createPendingInvitation('used-resend@hotel.com');
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { isUsed: true, usedAt: new Date() },
    });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-rs-5'),
    });
    const res = await resendPOST(req, { params: { id: invitation.id } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('مستخدمة');
  });

  it('still creates hotels with the create endpoint (POST) as SUPER_ADMIN', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-rs-6'),
      body: JSON.stringify({
        hotel: { name: 'فندق التحقق' },
        manager: { email: 'verify@hotel.com', name: 'المدير' },
      }),
    });
    const res = await hotelsPOST(req, {});
    expect(res.status).toBe(201);
  });
});
