import { apiUrl } from './apiConfig';

// Same-origin JSON API client. The session lives in an httpOnly cookie, so no token handling here.

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
  try {
    res = await fetch(apiUrl(path), {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      credentials: 'include',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, data?.message || `Request failed (${res.status}).`);
  }
  return data as T;
}
