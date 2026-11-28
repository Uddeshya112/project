import { apiUrl } from './apiConfig';

const AUTH_TOKEN_KEY = 'intellischedule_auth_token';

export function getAuthToken(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted browsing modes.
  }
}

export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fired when the server says the session is gone; AuthContext listens and returns to the login page. */
export const SESSION_EXPIRED_EVENT = 'intellischedule:session-expired';

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const headers: Record<string, string> = getAuthHeaders({
    'X-Requested-With': 'XMLHttpRequest',
  });
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    res = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      setAuthToken(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, data?.message || `Request failed (${res.status}).`);
  }
  return data as T;
}
