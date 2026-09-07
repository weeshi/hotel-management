import { NextRequest, NextResponse } from 'next/server';
import { withExternalAuth } from '@/middlewares/external-auth';
import { normalizeExternalBooking } from '@/lib/integrations/normalizers';
import { IntegrationService } from '@/lib/services/integration.service';

// Public API for external booking engines (Decoupled PMS Ledger). Authenticated
// with a per-hotel API key via withExternalAuth; no CSRF (no cookies involved);
// no session rate-limit because engines are trusted servers and the ledger
// makes retries idempotent.
const integrationService = new IntegrationService();

async function handler(request: NextRequest, { params }: { params: { engine: string } }) {
  const engine = params.engine.toLowerCase();

  const rawPayload = await request.text();
  let body: any;
  try {
    body = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON payload', code: 'VALIDATION_ERROR' } },
      { status: 400 }
    );
  }

  let normalized;
  try {
    normalized = normalizeExternalBooking(engine, body);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error?.message || 'Invalid payload', code: 'VALIDATION_ERROR' } },
      { status: 400 }
    );
  }

  const { hotelId } = (request as any).external;
  const result = await integrationService.injectBooking(engine, hotelId, normalized, rawPayload);
  return NextResponse.json(result.body, { status: result.status });
}

export const POST = withExternalAuth(handler);
