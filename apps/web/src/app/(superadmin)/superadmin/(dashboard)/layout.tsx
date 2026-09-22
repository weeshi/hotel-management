import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { prismaPlatform } from '@/lib/utils/prisma';
import { DashboardShell } from './shell';
import { ToastContainer } from '@/components/ui/toast';

export const dynamic = 'force-dynamic';

/**
 * Super-Admin dashboard shell — pure Server Component guard (SA.5).
 *
 * Mirrors the middleware decision at page-render level: only a session whose
 * access token carries `role === 'SUPER_ADMIN'` AND `tv === true` (the OTP
 * gate) may render here. There is no client-side `localStorage` auth source —
 * the HttpOnly cookie is the single source of truth, so a tampered or absent
 * client store can neither grant nor spoof access.
 */
export default async function SuperAdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) redirect('/superadmin/login');

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    redirect('/superadmin/login');
  }

  if (payload.role !== 'SUPER_ADMIN') redirect('/access-denied');
  if (payload.tv !== true) redirect('/superadmin/login');

  const user = await prismaPlatform.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) redirect('/superadmin/login');

  return (
    <>
      <DashboardShell user={{ name: user.name, email: user.email }}>{children}</DashboardShell>
      <ToastContainer />
    </>
  );
}