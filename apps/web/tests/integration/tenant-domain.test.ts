import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { GET as contextGET } from '@/app/api/auth/context/route';
import { POST as superadminPOST } from '@/app/api/superadmin/hotels/route';
import { PATCH as superadminPATCH } from '@/app/api/superadmin/hotels/[id]/route';

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

async function createHotelWithUser(hotel: { name: string; customDomain?: string | null }, user: { email: string; password: string }) {
  const hotelRecord = await prisma.hotel.create({
    data: { name: hotel.name, customDomain: hotel.customDomain ?? null },
  });
  const bcrypt = await import('bcryptjs');
  const password = await bcrypt.hash(user.password, 4);
  const userRecord = await prisma.user.create({
    data: {
      email: user.email,
      password,
      name: 'Test User',
      role: 'MANAGER' as Role,
      hotelId: hotelRecord.id,
    },
  });
  return { hotel: hotelRecord, user: userRecord };
}

function loginRequest(host: string, body: unknown) {
  return new NextRequest(`http://${host}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Tenant Domain — Super-admin creates hotel with customDomain', () => {
  const payload = (customDomain?: string) => ({
    hotel: {
      name: 'فندق الساحل',
      customDomain,
    },
    manager: {
      email: 'manager@coast.com',
      name: 'مدير الساحل',
    },
  });

  it('creates a hotel with a normalized customDomain', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-dom-1'),
      body: JSON.stringify(payload('DarAlSalam.Ly')),
    });
    const res = await superadminPOST(req, {});
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data.hotel.name).toBe('فندق الساحل');

    const hotel = await prisma.hotel.findUnique({ where: { id: body.data.hotel.id } });
    expect(hotel?.customDomain).toBe('daralsalam.ly');
  });

  it('builds the invitation link on the SaaS base URL, never on the customDomain', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    try {
      const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
        method: 'POST',
        headers: csrfHeaders('csrf-dom-2'),
        body: JSON.stringify(payload('daralsalam.ly')),
      });
      const res = await superadminPOST(req, {});
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data.invitationLink).toContain('https://app.example.com/auth/invitation?token=');
      expect(body.data.invitationLink).not.toMatch(/^https:\/\/daralsalam\.ly/);
      expect(body.data.invitationLink).toContain('domain=daralsalam.ly');
    } finally {
      delete process.env.NEXT_PUBLIC_APP_URL;
    }
  });

  it('rejects a duplicate customDomain with 422', async () => {
    await createHotelWithUser({ name: 'حجز مسبق', customDomain: 'taken.com' }, { email: 'taken@hotel.com', password: 'secret123' });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-dom-3'),
      body: JSON.stringify(payload('taken.com')),
    });
    const res = await superadminPOST(req, {});
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('مستخدم مسبقاً');
  });
});

describe('Tenant Domain — PATCH /api/superadmin/hotels/[id]', () => {
  it('sets a customDomain on an existing hotel', async () => {
    const { hotel } = await createHotelWithUser({ name: 'فندق جديد' }, { email: 'new@hotel.com', password: 'secret123' });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'PATCH',
      headers: csrfHeaders('csrf-patch-1'),
      body: JSON.stringify({ customDomain: 'NewDomain.Example.com' }),
    });
    const res = await superadminPATCH(req, { params: { id: hotel.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.customDomain).toBe('newdomain.example.com');

    const updated = await prisma.hotel.findUnique({ where: { id: hotel.id } });
    expect(updated?.customDomain).toBe('newdomain.example.com');
  });

  it('clears a customDomain when null is sent', async () => {
    const { hotel } = await createHotelWithUser(
      { name: 'فندق للمسح', customDomain: 'clear.me' },
      { email: 'clear@hotel.com', password: 'secret123' }
    );

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'PATCH',
      headers: csrfHeaders('csrf-patch-2'),
      body: JSON.stringify({ customDomain: null }),
    });
    const res = await superadminPATCH(req, { params: { id: hotel.id } });
    expect(res.status).toBe(200);

    const updated = await prisma.hotel.findUnique({ where: { id: hotel.id } });
    expect(updated?.customDomain).toBeNull();
  });

  it('rejects assigning a domain already used by another hotel', async () => {
    await createHotelWithUser({ name: 'صاحب النطاق', customDomain: 'reserved.com' }, { email: 'owner@hotel.com', password: 'secret123' });
    const { hotel } = await createHotelWithUser({ name: 'فندق آخر' }, { email: 'other@hotel.com', password: 'secret123' });

    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'PATCH',
      headers: csrfHeaders('csrf-patch-3'),
      body: JSON.stringify({ customDomain: 'reserved.com' }),
    });
    const res = await superadminPATCH(req, { params: { id: hotel.id } });
    expect(res.status).toBe(422);
  });

  it('returns 404 for an unknown hotel id', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'PATCH',
      headers: csrfHeaders('csrf-patch-4'),
      body: JSON.stringify({ customDomain: 'any.com' }),
    });
    const res = await superadminPATCH(req, { params: { id: '00000000-0000-0000-0000-000000000000' } });
    expect(res.status).toBe(404);
  });

  it('rejects non-super-admin roles with 403', async () => {
    const { hotel } = await createHotelWithUser({ name: 'فندق للأدوار' }, { email: 'roles@hotel.com', password: 'secret123' });

    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'PATCH',
      headers: csrfHeaders('csrf-patch-5'),
      body: JSON.stringify({ customDomain: 'denied.com' }),
    });
    const res = await superadminPATCH(req, { params: { id: hotel.id } });
    expect(res.status).toBe(403);
  });
});

describe('Tenant Domain — Host-locked login (strict per-hotel authentication)', () => {
  let userA: { email: string };
  let userB: { email: string };
  const PASSWORD = 'secret123';

  beforeEach(async () => {
    await createHotelWithUser(
      { name: 'فندق السلام', customDomain: 'daralsalam.ly' },
      { email: 'reception@daralsalam.ly', password: PASSWORD }
    ).then((a) => {
      userA = a.user;
    });
    await createHotelWithUser(
      { name: 'فندق النخيل', customDomain: 'nakheel.example.com' },
      { email: 'reception@nakheel.example.com', password: PASSWORD }
    ).then((b) => {
      userB = b.user;
    });
  });

  it('logs in a hotel user on their own customDomain', async () => {
    const res = await loginPOST(loginRequest('daralsalam.ly', { email: userA.email, password: PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.email).toBe(userA.email);
  });

  it('rejects a hotel user logging in on another hotel customDomain (uniform message)', async () => {
    const res = await loginPOST(loginRequest('daralsalam.ly', { email: userB.email, password: PASSWORD }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('rejects the wrong password with the same uniform message (no user enumeration)', async () => {
    const res = await loginPOST(loginRequest('daralsalam.ly', { email: userA.email, password: 'WrongPass123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('allows login on the generic SaaS host regardless of tenant', async () => {
    const res = await loginPOST(loginRequest('localhost', { email: userB.email, password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it('locks each direction: hotel B user on A fails, hotel A user on B fails', async () => {
    const resA = await loginPOST(loginRequest('nakheel.example.com', { email: userA.email, password: PASSWORD }));
    expect(resA.status).toBe(401);
    const resB = await loginPOST(loginRequest('daralsalam.ly', { email: userB.email, password: PASSWORD }));
    expect(resB.status).toBe(401);
  });

  it('sets host-only cookies (no Domain attribute) on successful login', async () => {
    const res = await loginPOST(loginRequest('daralsalam.ly', { email: userA.email, password: PASSWORD }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('accessToken=');
    expect(setCookie).toContain('refreshToken=');
    expect(setCookie).not.toMatch(/domain=/i);
  });
});

describe('Tenant Domain — SUPER_ADMIN login across hotel hosts', () => {
  const PASSWORD = 'super-secret-123';
  let crossSuper: { id: string; email: string };

  beforeEach(async () => {
    const bcrypt = await import('bcryptjs');
    const password = await bcrypt.hash(PASSWORD, 4);
    crossSuper = await prisma.user.create({
      data: {
        email: 'cross-super@platform.com',
        password,
        name: 'Cross Super',
        role: 'SUPER_ADMIN' as Role,
      },
    });
  });

  it('logs a SUPER_ADMIN (hotelId=null) in on a hotel customDomain host', async () => {
    await createHotelWithUser(
      { name: 'فندق الحاجز', customDomain: 'barrier.ly' },
      { email: 'barrier@staff.ly', password: 'secret123' }
    );
    const res = await loginPOST(loginRequest('barrier.ly', { email: crossSuper.email, password: PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.role).toBe('SUPER_ADMIN');
    // token carries no hotelId — SUPER_ADMIN is platform-wide
    expect(body.data.user.id).toBeTruthy();
  });

  it('logs a SUPER_ADMIN in on the generic SaaS host (localhost)', async () => {
    const res = await loginPOST(loginRequest('localhost', { email: crossSuper.email, password: PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.role).toBe('SUPER_ADMIN');
  });

  it('keeps regular hotel staff locked to their own host (isolation preserved)', async () => {
    const { user } = await createHotelWithUser(
      { name: 'فندق النخبة', customDomain: 'elite.ly' },
      { email: 'elite@staff.ly', password: 'secret123' }
    );
    await createHotelWithUser(
      { name: 'فندق آخر', customDomain: 'other.ly' },
      { email: 'other@staff.ly', password: 'secret123' }
    );
    const res = await loginPOST(loginRequest('other.ly', { email: user.email, password: 'secret123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });
});

describe('Tenant Domain — /api/auth/context branding', () => {
  beforeEach(async () => {
    await createHotelWithUser(
      { name: 'فندق البرج', customDomain: 'burj.ly' },
      { email: 'reception@burj.ly', password: 'secret123' }
    );
  });

  it('returns hotelId + hotelName for a known customDomain host', async () => {
    const res = await contextGET(new NextRequest('http://burj.ly/api/auth/context'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hotelId).toBeTruthy();
    expect(body.data.hotelName).toBe('فندق البرج');
  });

  it('returns nulls for an unknown host (generic SaaS context)', async () => {
    const res = await contextGET(new NextRequest('http://unknown.example.com/api/auth/context'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hotelId).toBeNull();
    expect(body.data.hotelName).toBeNull();
  });

  it('trusts x-forwarded-host only when the request is Cloudflare-proxied (cf-ray)', async () => {
    const res = await contextGET(
      new NextRequest('http://localhost/api/auth/context', {
        headers: { 'cf-ray': 'abc123-DFW', 'x-forwarded-host': 'burj.ly' },
      }),
      {}
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hotelName).toBe('فندق البرج');
  });

  it('ignores a spoofed x-forwarded-host on a direct (non-proxied) request', async () => {
    const res = await contextGET(
      new NextRequest('http://localhost/api/auth/context', {
        headers: { 'x-forwarded-host': 'burj.ly' },
      }),
      {}
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hotelId).toBeNull();
    expect(body.data.hotelName).toBeNull();
  });

  it('exposes only hotelId + hotelName — no secrets', async () => {
    const res = await contextGET(new NextRequest('http://burj.ly/api/auth/context'), {});
    const body = await res.json();
    const keys = Object.keys(body.data).sort();
    expect(keys).toEqual(['hotelId', 'hotelName']);
  });
});
