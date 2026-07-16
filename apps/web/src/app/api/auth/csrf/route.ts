import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  let token = cookieStore.get('csrf-token')?.value;

  if (!token) {
    token = crypto.randomUUID();
  }

  const response = NextResponse.json({ success: true, data: { token } });

  response.cookies.set('csrf-token', token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });

  return response;
}
