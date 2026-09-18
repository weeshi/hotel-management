import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyOtpChallengeToken } from '@/lib/utils/jwt';
import { getOtpResendCooldownSeconds, maskEmail } from '@/lib/utils/otp';
import { prisma } from '@/lib/utils/prisma';
import { OtpForm } from './otp-form';

export const dynamic = 'force-dynamic';

/**
 * OTP screen — Server Component, the authoritative gate of the pending 2FA
 * leg (SA.5). Nothing reaches the code form except this guard chain:
 *
 *  1. `sa_otp` challenge cookie present + signature valid
 *  2. scope === `superadmin:otp` with a real challengeId + userId
 *  3. challenge row live: not consumed, not expired
 *  4. account still exists AND still has 2FA enabled
 *
 * Any failure -> instant server-side redirect back to /superadmin/login.
 * There is no client-side "am I allowed?" probe — the cookie IS the ticket.
 */
export default async function SuperAdminOtpPage() {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('sa_otp')?.value;
  if (!cookieToken) redirect('/superadmin/login');

  let payload;
  try {
    payload = await verifyOtpChallengeToken(cookieToken);
  } catch {
    redirect('/superadmin/login');
  }

  if (payload.scope !== 'superadmin:otp' || !payload.challengeId || !payload.sub) {
    redirect('/superadmin/login');
  }

  const challenge = await prisma.otpChallenge.findFirst({
    where: { id: payload.challengeId, userId: payload.sub },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now()) {
    redirect('/superadmin/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { email: true, twoFactorEnabled: true },
  });
  if (!user || !user.twoFactorEnabled) {
    redirect('/superadmin/login');
  }

  const cooldownSeconds = getOtpResendCooldownSeconds();
  const lastCodeSent = challenge.lastCodeSentAt ?? challenge.createdAt;

  return (
    <OtpForm
      maskedEmail={maskEmail(user.email)}
      expiresInSeconds={Math.max(
        Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000),
        1
      )}
      // Timestamp (ms) at which the resend button unlocks again, derived
      // server-side so the client never has to guess the cooldown duration.
      resendUnlocksAt={lastCodeSent.getTime() + cooldownSeconds * 1000}
    />
  );
}