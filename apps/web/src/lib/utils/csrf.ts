let csrfToken = '';
let lastFetch = 0;

export async function getCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/auth/csrf');
    const data = await res.json();
    if (data.success) {
      csrfToken = data.data.token;
      lastFetch = Date.now();
      return csrfToken;
    }
  } catch {}

  if (csrfToken) return csrfToken;
  return '';
}

export function clearCsrfToken() {
  csrfToken = '';
  lastFetch = 0;
}

export function csrfHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}
