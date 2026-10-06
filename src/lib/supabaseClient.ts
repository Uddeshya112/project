// Backward-compatible API helper. Supabase browser authentication is no longer used.
import { apiUrl } from './apiConfig';

export const supabaseClient: null = null;

export async function getSupabaseAccessToken(): Promise<null> {
  return null;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const body = init.body !== undefined && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body;
  const response = await fetch(apiUrl(path), { ...init, headers, body, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.message || `Request failed with HTTP ${response.status}`);
  return data as T;
}
