// Invitation links ALWAYS point at the main SaaS base URL — never at a hotel
// customDomain — so they keep working while DNS/Cloudflare is still
// propagating for a brand-new domain. The customDomain is carried only as
// informational context (`?domain=...`).

export function buildInvitationLink(
  token: string,
  options?: { customDomain?: string | null; origin?: string }
) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || options?.origin || '').replace(/\/+$/, '');
  const domainQuery = options?.customDomain
    ? `&domain=${encodeURIComponent(options.customDomain)}`
    : '';
  return `${baseUrl}/auth/invitation?token=${token}${domainQuery}`;
}
