import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['PASSPORT', 'NATIONAL_ID'];

export interface UploadedFile {
  name: string;
  declaredType: string;
  size: number;
  buffer: Buffer;
}

// --- Detect real file type from magic bytes (never trust the client) ---
export function detectMime(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
}

function resolveFullPath(storagePath: string): string {
  const storageRoot = path.resolve(process.cwd(), 'storage');
  const fullPath = path.resolve(storageRoot, storagePath);

  // Path-traversal guard: resolved file MUST live under the private storage root
  if (fullPath !== storageRoot && !fullPath.startsWith(storageRoot + path.sep)) {
    throw new ValidationError('مسار الملف غير صالح');
  }
  return fullPath;
}

export class GuestDocumentService {
  async uploadDocument(params: {
    guestId: string;
    hotelId: string;
    uploadedById: string;
    documentType: string;
    file: UploadedFile;
  }) {
    const { guestId, hotelId, uploadedById, documentType, file } = params;

    const guest = await prisma.guest.findFirst({ where: { id: guestId, hotelId } });
    if (!guest) throw new NotFoundError('النزيل غير موجود');

    const type = documentType.toUpperCase();
    if (!ALLOWED_TYPES.includes(type)) throw new ValidationError('نوع الوثيقة غير صالح');
    if (!file.buffer || file.buffer.length === 0) throw new ValidationError('الملف مطلوب');
    if (!ALLOWED_MIME.has(file.declaredType)) {
      throw new ValidationError('نوع الملف غير مسموح (JPG أو PNG أو PDF فقط)');
    }
    if (file.size > MAX_SIZE) throw new ValidationError('حجم الملف يتجاوز 5MB');

    const detectedType = detectMime(file.buffer);
    if (!detectedType) throw new ValidationError('محتوى الملف غير صالح أو من نوع غير مسموح');
    if (file.declaredType !== detectedType) {
      throw new ValidationError('نوع الملف لا يطابق محتواه الفعلي');
    }

    const ext = path.extname(file.name).toLowerCase().slice(0, 10) || '.jpg';
    const safeName = `${randomUUID()}${ext}`;
    // Relative path stored in DB; absolute path resolved at runtime. NEVER under public/.
    const relativePath = path.join('guest-documents', guestId, safeName);
    const fullPath = resolveFullPath(relativePath);

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.buffer, { flag: 'wx' });

    return prisma.guestDocument.create({
      data: {
        guestId,
        documentType: type,
        fileName: file.name.slice(0, 255),
        fileMimeType: detectedType,
        storagePath: relativePath,
        uploadedById,
      },
    });
  }

  async listDocuments(guestId: string, hotelId: string) {
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, hotelId },
      select: { id: true },
    });
    if (!guest) throw new NotFoundError('النزيل غير موجود');

    return prisma.guestDocument.findMany({
      where: { guestId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  async downloadDocument(documentId: string, hotelId: string) {
    const document = await prisma.guestDocument.findFirst({
      where: { id: documentId, guest: { hotelId } },
    });
    if (!document) throw new NotFoundError('الوثيقة غير موجودة');

    const fullPath = resolveFullPath(document.storagePath);
    try {
      const buffer = await readFile(fullPath);
      return { document, buffer };
    } catch (error: any) {
      if (error?.code === 'ENOENT') throw new NotFoundError('الملف غير موجود');
      throw error;
    }
  }
}
