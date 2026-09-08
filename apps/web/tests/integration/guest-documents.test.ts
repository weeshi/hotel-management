import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import { access } from 'fs/promises';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { GuestDocumentService } from '@/lib/services/guest-document.service';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

const documentService = new GuestDocumentService();

let data: Awaited<ReturnType<typeof seedTestData>>;
let guestId: string;
const createdFiles: string[] = [];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_SIG = Buffer.from('%PDF-1.4');
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
  const guest = await prisma.guest.create({ data: { name: 'نزيل وثائق', hotelId: data.hotel.id } });
  guestId = guest.id;
});

afterAll(async () => {
  for (const rel of createdFiles) {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(path.resolve(process.cwd(), 'storage', rel));
    } catch {}
  }
  await closeDb();
});

async function recordStoragePath(record: { storagePath: string }) {
  createdFiles.push(record.storagePath);
  return record;
}

describe('Guest Document Management (Secure Storage)', () => {
  it('stores a valid PNG in the private storage dir (never public)', async () => {
    const record = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'PASSPORT',
      file: { name: 'passport.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
    });
    await recordStoragePath(record);

    expect(record.documentType).toBe('PASSPORT');
    expect(record.fileMimeType).toBe('image/png');
    expect(record.storagePath).toContain('guest-documents');
    expect(record.storagePath).not.toContain('public');

    // File exists under private storage
    const privatePath = path.resolve(process.cwd(), 'storage', record.storagePath);
    await expect(access(privatePath)).resolves.toBeUndefined();

    // NOT under public/uploads
    const publicPath = path.resolve(process.cwd(), 'public', record.storagePath);
    await expect(access(publicPath)).rejects.toThrow();
  });

  it('accepts PDF and JPEG magic bytes', async () => {
    const pdf = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'NATIONAL_ID',
      file: { name: 'id.pdf', declaredType: 'application/pdf', size: PDF_SIG.length, buffer: PDF_SIG },
    });
    await recordStoragePath(pdf);
    expect(pdf.fileMimeType).toBe('application/pdf');

    const jpeg = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'NATIONAL_ID',
      file: { name: 'id.jpg', declaredType: 'image/jpeg', size: JPEG_SIG.length, buffer: JPEG_SIG },
    });
    await recordStoragePath(jpeg);
    expect(jpeg.fileMimeType).toBe('image/jpeg');
  });

  it('rejects disallowed MIME types', async () => {
    await expect(
      documentService.uploadDocument({
        guestId,
        hotelId: data.hotel.id,
        uploadedById: data.admin.id,
        documentType: 'PASSPORT',
        file: { name: 'evil.exe', declaredType: 'application/x-msdownload', size: 100, buffer: Buffer.from('MZ...') },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects files whose content does not match the declared type', async () => {
    await expect(
      documentService.uploadDocument({
        guestId,
        hotelId: data.hotel.id,
        uploadedById: data.admin.id,
        documentType: 'PASSPORT',
        file: { name: 'fake.png', declaredType: 'image/png', size: PDF_SIG.length, buffer: PDF_SIG },
      }),
    ).rejects.toThrow('نوع الملف لا يطابق محتواه الفعلي');
  });

  it('rejects files over 5MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    PNG_SIG.copy(big, 0);
    await expect(
      documentService.uploadDocument({
        guestId,
        hotelId: data.hotel.id,
        uploadedById: data.admin.id,
        documentType: 'PASSPORT',
        file: { name: 'big.png', declaredType: 'image/png', size: big.length, buffer: big },
      }),
    ).rejects.toThrow('حجم الملف يتجاوز 5MB');
  });

  it('rejects invalid document type', async () => {
    await expect(
      documentService.uploadDocument({
        guestId,
        hotelId: data.hotel.id,
        uploadedById: data.admin.id,
        documentType: 'DRIVER_LICENSE',
        file: { name: 'dl.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
      }),
    ).rejects.toThrow('نوع الوثيقة غير صالح');
  });

  it('downloads the file back with metadata intact', async () => {
    const record = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'PASSPORT',
      file: { name: 'passport.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
    });
    await recordStoragePath(record);

    const { document, buffer } = await documentService.downloadDocument(record.id, data.hotel.id);
    expect(document.id).toBe(record.id);
    expect(buffer.equals(PNG_SIG)).toBe(true);
    expect(document.fileMimeType).toBe('image/png');
  });

  it('lists documents for a guest ordered newest first', async () => {
    const first = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'PASSPORT',
      file: { name: 'a.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
    });
    await recordStoragePath(first);
    const second = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'NATIONAL_ID',
      file: { name: 'b.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
    });
    await recordStoragePath(second);

    const docs = await documentService.listDocuments(guestId, data.hotel.id);
    expect(docs).toHaveLength(2);
    expect(docs[0].id).toBe(second.id);
  });

  it('blocks path traversal in storagePath', async () => {
    const evil = await prisma.guestDocument.create({
      data: {
        guestId,
        documentType: 'PASSPORT',
        fileName: 'evil',
        fileMimeType: 'image/png',
        storagePath: path.join('..', '..', '..', 'outside', 'secret.png'),
        uploadedById: data.admin.id,
      },
    });

    await expect(documentService.downloadDocument(evil.id, data.hotel.id)).rejects.toThrow(ValidationError);
  });

  it('throws NotFound for a missing document or missing file', async () => {
    await expect(documentService.downloadDocument('missing-id', data.hotel.id)).rejects.toThrow(NotFoundError);

    const record = await documentService.uploadDocument({
      guestId,
      hotelId: data.hotel.id,
      uploadedById: data.admin.id,
      documentType: 'PASSPORT',
      file: { name: 'gone.png', declaredType: 'image/png', size: PNG_SIG.length, buffer: PNG_SIG },
    });
    // delete the file behind its back
    const { unlink } = await import('fs/promises');
    await unlink(path.resolve(process.cwd(), 'storage', record.storagePath));

    await expect(documentService.downloadDocument(record.id, data.hotel.id)).rejects.toThrow(NotFoundError);
  });
});
