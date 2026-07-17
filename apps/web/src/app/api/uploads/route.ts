import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse } from '@/lib/utils/api-response';

async function handler(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('ط§ظ„ظ…ظ„ظپ ظ…ط·ظ„ظˆط¨', 400);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = path.extname(file.name) || '.jpg';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'rooms');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const url = `/uploads/rooms/${filename}`;
    return NextResponse.json({ success: true, data: { url, filename } });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط±ظپط¹ ط§ظ„ظ…ظ„ظپ', 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
