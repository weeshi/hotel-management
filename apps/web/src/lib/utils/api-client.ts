import { getCsrfToken, csrfHeaders } from './csrf';

// --- Response Types ---

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// --- Refresh Token Queue ---

let isRefreshing = false;
let sessionExpired = false;
let failedQueue: Array<{
  resolve: (success: boolean) => void;
}> = [];

function processQueue(success: boolean) {
  failedQueue.forEach(({ resolve }) => resolve(success));
  failedQueue = [];
}

async function attemptRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('accessToken', data.data.accessToken);
      if (data.data.user) {
        localStorage.setItem('user', JSON.stringify(data.data.user));
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function redirectToLogin() {
  localStorage.clear();
  window.location.href = '/auth/login';
}

// --- Main Fetch Function ---

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  if (sessionExpired) {
    return { success: false as const, error: { message: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً' } };
  }

  const token = localStorage.getItem('accessToken');

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'string') {
    try {
      JSON.parse(options.body);
      headers['Content-Type'] = 'application/json';
    } catch {}
  }

  let res = await fetch(url, { ...options, headers });

  // --- Silent Refresh on 401 ---
  if (res.status === 401 && token) {
    if (!isRefreshing) {
      isRefreshing = true;

      const success = await attemptRefresh();

      if (success) {
        processQueue(true);
        isRefreshing = false;

        const newToken = localStorage.getItem('accessToken');
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(url, { ...options, headers });
      } else {
        sessionExpired = true;
        processQueue(false);
        isRefreshing = false;
        redirectToLogin();
        return { success: false as const, error: { message: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً' } };
      }
    } else {
      const success = await new Promise<boolean>((resolve) => {
        failedQueue.push({ resolve });
      });

      if (success) {
        const newToken = localStorage.getItem('accessToken');
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(url, { ...options, headers });
      } else {
        sessionExpired = true;
        redirectToLogin();
        return { success: false as const, error: { message: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً' } };
      }
    }
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  if (res.ok) {
    return { success: true as const, data: (await res.text()) as any };
  }
  return { success: false as const, error: { message: await res.text() } };
}

// --- Convenience Wrappers ---

export async function apiGet<T = any>(url: string): Promise<ApiResponse<T>> {
  return apiFetch<T>(url, { method: 'GET' });
}

export async function apiPost<T = any>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  await getCsrfToken();
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { ...csrfHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T = any>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  await getCsrfToken();
  return apiFetch<T>(url, {
    method: 'PUT',
    headers: { ...csrfHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T = any>(url: string): Promise<ApiResponse<T>> {
  await getCsrfToken();
  return apiFetch<T>(url, {
    method: 'DELETE',
    headers: { ...csrfHeaders() },
  });
}

export async function apiPatch<T = any>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  await getCsrfToken();
  return apiFetch<T>(url, {
    method: 'PATCH',
    headers: { ...csrfHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
