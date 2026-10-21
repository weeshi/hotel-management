import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { InvitationService } from '@/lib/services/invitation.service';
import { AuthService } from '@/lib/services/auth.service';
import { POST as registerPOST } from '@/app/api/auth/register/route';
import { GET as validateGET } from '@/app/api/auth/invitations/[token]/route';
import { POST as superadminPOST } from '@/app/api/superadmin/hotels/route';

const invitationService = new InvitationService();
const authService = new AuthService();

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
  // Platform routes require a 2FA-verified session (	v); mirror that here.
  const token = await signAccessToken({ userId, role, tv: role === 'SUPER_ADMIN' ? true : undefined });
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

const validPayload = {
  hotel: {
    name: 'فندق البحر',
    nameAr: 'فندق البحر',
    currency: 'LYD',
  },
  manager: {
    email: 'manager@seahotel.com',
    name: 'مدير الفندق',
  },
};

describe('SaaS Onboarding — Super-Admin hotel creation', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await superadminPOST(new NextRequest(BASE_URL, { method: 'POST' }), {});
    expect(res.status).toBe(401);
  });

  it('rejects non-super-admin roles with 403', async () => {
    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-1'),
      body: JSON.stringify(validPayload),
    });
    const res = await superadminPOST(req, {});
    expect(res.status).toBe(403);
  });

  it('creates a hotel and an invitation for the manager', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-2'),
      body: JSON.stringify(validPayload),
    });
    const res = await superadminPOST(req, {});
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.hotel.name).toBe('فندق البحر');
    expect(body.data.invitation.email).toBe('manager@seahotel.com');
    expect(body.data.invitation.role).toBe('MANAGER');
    expect(body.data.invitationLink).toContain('/auth/invitation?token=');
    expect(body.data.invitationLink).not.toContain(body.data.invitation.id);

    const hotel = await prisma.hotel.findUnique({ where: { id: body.data.hotel.id } });
    expect(hotel).not.toBeNull();
    expect(hotel?.name).toBe('فندق البحر');

    const all = await prisma.invitation.findMany({ where: { hotelId: hotel!.id } });
    expect(all).toHaveLength(1);
    expect(all[0].isUsed).toBe(false);
    expect(all[0].email).toBe('manager@seahotel.com');

    // Only the SHA-256 hash of the token is stored — never the raw token itself
    const rawToken = new URL(body.data.invitationLink).searchParams.get('token')!;
    expect(rawToken).toBeTruthy();
    expect(all[0].tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(all[0].tokenHash).not.toBe(rawToken);
  });

  it('returns 422 for invalid payload', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-3'),
      body: JSON.stringify({ hotel: {}, manager: { email: 'bad' } }),
    });
    const res = await superadminPOST(req, {});
    expect(res.status).toBe(422);
  });

  it('rejects a manager email already in use', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-4'),
      body: JSON.stringify({
        hotel: { name: 'فندق آخر' },
        manager: { email: data.admin.email },
      }),
    });
    const res = await superadminPOST(req, {});
    expect(res.status).toBe(422);
  });
});

describe('SaaS Onboarding — Invitation validation', () => {
  let token: string;

  beforeEach(async () => {
    const result = await invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق النخيل' },
      manager: { email: 'manager@palm.com' },
      createdById: superAdmin.id,
    });
    token = result.token;
  });

  it('returns invitation details for a valid token', async () => {
    const res = await validateGET(new NextRequest(BASE_URL), { params: { token } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('manager@palm.com');
    expect(body.data.hotelName).toBe('فندق النخيل');
  });

  it('returns 404 for an invalid token', async () => {
    const res = await validateGET(new NextRequest(BASE_URL), { params: { token: 'garbage-token' } });
    expect(res.status).toBe(404);
  });
});

describe('SaaS Onboarding — Accept invitation (registration)', () => {
  let token: string;

  async function createInvitation(email: string) {
    const result = await invitationService.createHotelWithInvitation({
      hotel: { name: 'فندق الواحة' },
      manager: { email },
      createdById: superAdmin.id,
    });
    return result.token;
  }

  async function register(body: any) {
    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return registerPOST(req, {});
  }

  it('rejects registration without a token', async () => {
    const res = await register({ name: 'بدون رمز', password: 'secret123' });
    expect(res.status).toBe(422);
  });

  it('rejects registration with an invalid token', async () => {
    const res = await register({ token: 'not-a-real-token', name: 'مستخدم', password: 'secret123' });
    expect(res.status).toBe(404);
  });

  it('creates the user with the invitation hotelId and role, and marks the invitation used', async () => {
    token = await createInvitation('manager@oasis.com');

    const res = await register({ token, name: 'مدير الواحة', password: 'secret123', phone: '+218911111111' });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data.email).toBe('manager@oasis.com');
    expect(body.data.role).toBe('MANAGER');
    expect(body.data.hotelId).toBeDefined();

    const user = await prisma.user.findUnique({ where: { email: 'manager@oasis.com' } });
    expect(user?.hotelId).toBe(body.data.hotelId);
    expect(user?.isActive).toBe(true);

    const invitation = await prisma.invitation.findFirst({ where: { email: 'manager@oasis.com' } });
    expect(invitation?.isUsed).toBe(true);
    expect(invitation?.usedAt).not.toBeNull();
  });

  it('rejects reusing the same token after acceptance', async () => {
    token = await createInvitation('manager2@oasis.com');

    const first = await register({ token, name: 'أول', password: 'secret123' });
    expect(first.status).toBe(201);

    const second = await register({ token, name: 'ثاني', password: 'secret123' });
    expect(second.status).toBe(422);
    const body = await second.json();
    expect(body.error.message).toContain('مستخدم مسبقاً');
  });

  it('rejects expired invitations', async () => {
    token = await createInvitation('manager3@oasis.com');

    const invitation = await prisma.invitation.findFirst({ where: { email: 'manager3@oasis.com' } });
    await prisma.invitation.update({
      where: { id: invitation!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await register({ token, name: 'متأخر', password: 'secret123' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('انتهت صلاحية');
  });

  it('the created user can log in', async () => {
    token = await createInvitation('manager4@oasis.com');
    await register({ token, name: 'مدير', password: 'secret123' });

    const result = await authService.login('manager4@oasis.com', 'secret123');
    expect(result.user.email).toBe('manager4@oasis.com');
    expect(result.user.role).toBe('MANAGER');
    expect(result.accessToken).toBeTruthy();
  });
});
