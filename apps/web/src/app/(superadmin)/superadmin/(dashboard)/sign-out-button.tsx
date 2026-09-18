'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { Button } from '@/components/ui/button';

/**
 * Signs the Super-Admin out: POSTs to the revocation endpoint (clears the
 * HttpOnly access/refresh + any pending OTP cookie server-side), then hard-
 * navigates so no client-stored state survives the shell.
 */
export function SignOutButton({ fullWidth }: { fullWidth?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) return;
    setLoading(true);
    try {
      const token = await getCsrfToken();
      await fetch('/api/superadmin/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: '{}',
      });
    } catch {
      /* revocation is best-effort; navigation still clears the client */
    } finally {
      router.replace('/superadmin/login');
    }
  }

  return (
    <Button
      variant="danger"
      size="sm"
      data-testid="superadmin-logout-btn"
      onClick={handleSignOut}
      loading={loading}
      className={fullWidth ? 'w-full' : undefined}
    >
      {loading ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
    </Button>
  );
}