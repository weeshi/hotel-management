import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/utils/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { SUPPORTED_ENGINES } from '@/lib/integrations/normalizers';

export interface ExternalRequest extends NextRequest {
  external?: {
    hotelId: string;
    engine: string;
  };
}

// Authenticates external booking-engine requests via a per-hotel API key
// (AGENTS.md §16 / §14). The tenant is resolved ONLY from the DB-stored key —
// never from claims in the payload. Comparison is constant-time.
export function withExternalAuth(handler: Function) {
  return async (request: ExternalRequest, context: any) => {
    try {
      const apiKey = request.headers.get('x-api-key');
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: { message: 'Missing API key', code: 'UNAUTHORIZED' } },
          { status: 401 }
        );
      }

      const engine = String(context?.params?.engine || '').toLowerCase();
      if (!(SUPPORTED_ENGINES as readonly string[]).includes(engine)) {
        return NextResponse.json(
          { success: false, error: { message: 'Unknown engine', code: 'NOT_FOUND' } },
          { status: 404 }
        );
      }

      const configs = await prisma.integrationConfig.findMany({
        where: { engine, isActive: true },
      });

      let matchedHotelId: string | null = null;
      const keyBuf = Buffer.from(apiKey, 'utf8');

      for (const config of configs) {
        if (!config.apiKeyEnc) continue;
        let stored: string;
        try {
          stored = decryptSecret(config.apiKeyEnc);
        } catch {
          continue;
        }
        const storedBuf = Buffer.from(stored, 'utf8');
        if (storedBuf.length === keyBuf.length && timingSafeEqual(storedBuf, keyBuf)) {
          matchedHotelId = config.hotelId;
          break;
        }
      }

      if (!matchedHotelId) {
        return NextResponse.json(
          { success: false, error: { message: 'Invalid API key', code: 'UNAUTHORIZED' } },
          { status: 401 }
        );
      }

      (request as any).external = { hotelId: matchedHotelId, engine };
      return handler(request, context);
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication failed', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }
  };
}
