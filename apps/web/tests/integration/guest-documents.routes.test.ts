import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import { unlink } from 'fs/promises';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { GuestDocumentService } from '@/lib/services/guest-document.service';
import { GET as downloadGET } from '@/app/api/admin/documents/[documentId]/download/route';
import { GET as listGET, POST as uploadPOST } from '@/app/api/admin/guests/[id]/documents/route';

const documentService = new GuestDocumentService();

let data: Awaited<ReturnType<typeof seedTestData>>;
let guestId: string;
const createdFiles: string[] = [];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE_URL = 'http://localhost/api';

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
  const guest = await prisma.guest.create({ data: { name: 'نزيل وثائق', hotelId: data.hotel.id } });
  guestId = guest.id;
});

afterAll(async () => {
  for (const rel of createdFiles) {
    try {
      await unlink(path.resolve(process.cwd(), 'storage', rel));
    } catch {}
  }
  await closeDb();
});

async function extraUser(role: string) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}@test.com`,
      password: 'hashed',
      name: `Test ${role}`,
      role: role as Role,
      hotelId: data.hotel.id,
    },
  });
}

async function authRequest(role: string, userId: string, init: RequestInit = {}) {
  const token = await signAccessToken({ userId, role, hotelId: data.hotel.id });
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

function pngFormData() {
  const form = new FormData();
  form.append('documentType', 'PASSPORT');
  form.append('file', new File([PNG_SIG], 'passport.png', { type: 'image/png' }));
  return form;
}

describe('Guest Document API — auth & role enforcement', () => {
  describe('GET /api/admin/guests/[id]/documents', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await listGET(new NextRequest(BASE_URL), { params: { id: guestId } });
      expect(res.status).toBe(401);
    });

    it('rejects requests with an invalid token with 401', async () => {
      const req = new NextRequest(BASE_URL, { headers: { authorization: 'Bearer garbage-token' } });
      const res = await listGET(req, { params: { id: guestId } });
      expect(res.status).toBe(401);
    });

    it('rejects disallowed roles with 403', async () => {
      const housekeeping = await extraUser('HOUSEKEEPING');
      const req = await authRequest('HOUSEKEEPING', housekeeping.id);
      const res = await listGET(req, { params: { id: guestId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN, MANAGER and RECEPTION and returns the document list', async () => {
      const manager = await extraUser('MANAGER');

      for (const [role, user] of [
        ['ADMIN', data.admin],
        ['MANAGER', manager],
        ['RECEPTION', data.receptionist],
      ] as const) {
        const req = await authRequest(role, user.id);
        const res = await listGET(req, { params: { id: guestId } });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      }
    });

    it('returns documents uploaded for the guest, newest first', async () => {
      const record = await documentService.uploadDocument({
        guestId,
        hotelId: data.hotel.id,
        uploadedById: data.admin.id,
        documentType: 'PASSPORT',
        file: { name: 'passport.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
      });
      createdFiles.push(record.storagePath);

      const req = await authRequest('RECEPTION', data.receptionist.id);
      const res = await listGET(req, { params: { id: guestId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(record.id);
      expect(body.data[0].documentType).toBe('PASSPORT');
    });
  });

  describe('POST /api/admin/guests/[id]/documents', () => {
    it('rejects uploads without a CSRF token with 403', async () => {
      const req = await authRequest('ADMIN', data.admin.id, {
        method: 'POST',
        body: pngFormData(),
      });
      const res = await uploadPOST(req, { params: { id: guestId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toBe('طلب غير مصرح به (CSRF)');
    });

    it('rejects uploads with a mismatched CSRF token with 403', async () => {
      const req = await authRequest('ADMIN', data.admin.id, {
        method: 'POST',
        headers: { cookie: 'csrf-token=aaa', 'x-csrf-token': 'bbb' },
        body: pngFormData(),
      });
      const res = await uploadPOST(req, { params: { id: guestId } });
      expect(res.status).toBe(403);
    });

    it('rejects uploads from disallowed roles even with valid CSRF with 403', async () => {
      const accountant = await extraUser('ACCOUNTANT');
      const req = await authRequest('ACCOUNTANT', accountant.id, {
        method: 'POST',
        headers: csrfHeaders('csrf-test-token'),
        body: pngFormData(),
      });
      const res = await uploadPOST(req, { params: { id: guestId } });
      expect(res.status).toBe(403);
    });

    it('rejects uploads without a file with 400', async () => {
      const form = new FormData();
      form.append('documentType', 'PASSPORT');
      const req = await authRequest('ADMIN', data.admin.id, {
        method: 'POST',
        headers: csrfHeaders('csrf-test-token'),
        body: form,
      });
      const res = await uploadPOST(req, { params: { id: guestId } });
      expect(res.status).toBe(400);
    });

    it('stores an upload to private storage for ADMIN with valid CSRF (201)', async () => {
      const req = await authRequest('ADMIN', data.admin.id, {
        method: 'POST',
        headers: csrfHeaders('csrf-test-token'),
        body: pngFormData(),
      });
      const res = await uploadPOST(req, { params: { id: guestId } });
      expect(res.status).toBe(201);

      const body = await res.json();
      const record = body.data;
      createdFiles.push(record.storagePath);
      expect(record.documentType).toBe('PASSPORT');
      expect(record.fileMimeType).toBe('image/png');
      expect(record.storagePath).toContain('guest-documents');

      const stored = await prisma.guestDocument.findUnique({ where: { id: record.id } });
      expect(stored).not.toBeNull();
      expect(stored?.uploadedById).toBe(data.admin.id);
    });

    it('allows MANAGER and RECEPTION to upload with valid CSRF', async () => {
      const manager = await extraUser('MANAGER');

      for (const [role, user] of [
        ['MANAGER', manager],
        ['RECEPTION', data.receptionist],
      ] as const) {
        const req = await authRequest(role, user.id, {
          method: 'POST',
          headers: csrfHeaders('csrf-test-token'),
          body: pngFormData(),
        });
        const res = await uploadPOST(req, { params: { id: guestId } });
        expect(res.status).toBe(201);
        const body = await res.json();
        createdFiles.push(body.data.storagePath);
      }
    });

    it('returns 422 for an invalid document type through the API', async () => {
      const form = new FormData();
      form.append('documentType', 'DRIVER_LICENSE');
      form.append('file', new File([PNG_SIG], 'dl.png', { type: 'image/png' }));
      const req = await authRequest('ADMIN', data.admin.id, {
        method: 'POST',
        headers: csrfHeaders('csrf-test-token'),
        body: form,
      });
      const res = await uploadPOST(req, { params: { id: guestId } });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/admin/documents/[documentId]/download', () => {
    it('rejects unauthenticated downloads with 401', async () => {
      const res = await downloadGET(new NextRequest(BASE_URL), { params: { documentId: 'x' } });
      expect(res.status).toBe(401);
    });

    it('rejects disallowed roles with 403', async () => {
      const maintenance = await extraUser('MAINTENANCE');
      const req = await authRequest('MAINTENANCE', maintenance.id);
      const res = await downloadGET(req, { params: { documentId: 'x' } });
      expect(res.status).toBe(403);
    });

    it('serves the file to an allowed role with correct headers', async () => {
      const record = await documentService.uploadDocument({
        guestId,
        hotelId: data.hotel.id,
        uploadedById: data.admin.id,
        documentType: 'PASSPORT',
        file: { name: 'passport.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
      });
      createdFiles.push(record.storagePath);

      const req = await authRequest('ADMIN', data.admin.id);
      const res = await downloadGET(req, { params: { documentId: record.id } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(res.headers.get('Content-Disposition')).toContain('inline');

      const buffer = Buffer.from(await res.arrayBuffer());
      expect(buffer.equals(PNG_SIG)).toBe(true);
    });

    it('returns 404 for a missing document', async () => {
      const req = await authRequest('RECEPTION', data.receptionist.id);
      const res = await downloadGET(req, { params: { documentId: 'missing-id' } });
      expect(res.status).toBe(404);
    });
  });
});
