import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || 'dev-access-secret-min-32-chars-long!!'
);

const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-min-32-chars-long!!'
);

// Super-Admin OTP challenge cookie secret. Dedicated secret (not ACCESS/REFRESH)
// so the pending-challenge token has its own key material and blast radius.
// Dev fallback mirrors the JWT fallbacks above (docs/SUPER-ADMIN-ARCH.md §8).
const OTP_SECRET = new TextEncoder().encode(
  process.env.SUPERADMIN_OTP_SECRET || 'dev-superadmin-otp-min-32-chars-long!!'
);

export interface AccessTokenPayload extends JWTPayload {
  userId: string;
  role: string;
  hotelId?: string;
  /** true only when the session passed the Super-Admin 2FA (OTP) gate. */
  tv?: boolean;
}

export interface RefreshTokenPayload extends JWTPayload {
  userId: string;
  tokenId: string;
  family: string;
  /** Preserved across refreshes so a 2FA'd session stays verified. */
  tv?: boolean;
}

export interface OtpChallengePayload extends JWTPayload {
  scope: 'superadmin:otp';
  challengeId: string;
  purpose: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(ACCESS_SECRET);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET);
  return payload as unknown as AccessTokenPayload;
}

export async function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(REFRESH_SECRET);
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, REFRESH_SECRET);
  return payload as unknown as RefreshTokenPayload;
}

// --- Super-Admin OTP challenge token (docs/SUPER-ADMIN-ARCH.md §5) ---
// Scoped, short-lived proof that the first factor (password) succeeded. It is
// intentionally NOT an access token: it carries scope 'superadmin:otp' and can
// only be redeemed at /api/superadmin/auth/verify-otp.
export async function signOtpChallengeToken(params: {
  userId: string;
  challengeId: string;
  purpose: string;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({
    scope: 'superadmin:otp',
    challengeId: params.challengeId,
    purpose: params.purpose,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(params.expiresAt)
    .sign(OTP_SECRET);
}

export async function verifyOtpChallengeToken(token: string): Promise<OtpChallengePayload> {
  const { payload } = await jwtVerify(token, OTP_SECRET);
  return payload as unknown as OtpChallengePayload;
}
