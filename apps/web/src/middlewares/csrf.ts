import { NextRequest, NextResponse } from 'next/server';

export function withCsrf(handler: Function) {
  return async (request: NextRequest, context: any) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return handler(request, context);
    }

    const cookieToken = request.cookies.get('csrf-token')?.value;
    const headerToken = request.headers.get('x-csrf-token');

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return NextResponse.json(
        { success: false, error: { message: 'طلب غير مصرح به (CSRF)' } },
        { status: 403 }
      );
    }

    return handler(request, context);
  };
}
