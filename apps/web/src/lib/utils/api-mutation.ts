import { getCsrfToken, csrfHeaders } from './csrf';
import { addToast } from './toast';
import { apiFetch } from './api-client';

type Method = 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface MutationOptions {
  method: Method;
  url: string;
  body?: any;
  onSuccess?: () => void;
  successMsg?: string;
  errorMsg?: string;
}

export async function apiMutation(options: MutationOptions) {
  const { method, url, body, onSuccess, successMsg, errorMsg } = options;

  try {
    await getCsrfToken();

    const res = await apiFetch(url, {
      method,
      headers: { ...csrfHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.success) {
      addToast('error', res.error?.message || errorMsg || 'فشلت العملية');
      return false;
    }

    if (successMsg) addToast('success', successMsg);
    if (onSuccess) onSuccess();
    return true;
  } catch (err: any) {
    addToast('error', errorMsg || 'حدث خطأ في الاتصال بالخادم');
    return false;
  }
}

export async function apiPost(url: string, body: any, options?: { onSuccess?: () => void; successMsg?: string; errorMsg?: string }) {
  return apiMutation({ method: 'POST', url, body, ...options });
}

export async function apiPut(url: string, body: any, options?: { onSuccess?: () => void; successMsg?: string; errorMsg?: string }) {
  return apiMutation({ method: 'PUT', url, body, ...options });
}

export async function apiDelete(url: string, options?: { onSuccess?: () => void; successMsg?: string; errorMsg?: string }) {
  return apiMutation({ method: 'DELETE', url, ...options });
}
