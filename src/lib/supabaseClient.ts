import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { apiUrl } from './apiConfig';

// Browser-safe Supabase configuration
// NEVER include SUPABASE_SERVICE_ROLE_KEY here!
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://oopbelkjbnhdjvskmplc.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_9lN0TL3pTk-1Q7xgL74Nyw_1v0q-u9T';

/**
 * Public Supabase client for client-side subscriptions and public storage.
 * All privileged writes and master data queries route through the secure /api backend.
 */
export const supabaseClient: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/**
 * Retrieve the current Supabase access token directly from active session.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (supabaseClient) {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (!error && session?.access_token) {
        return session.access_token;
      }
    } catch (err) {
      console.warn('[AUTH TRACE] Error getting session access token:', err);
    }
  }
  return null;
}

/**
 * Backend API Client Helper
 * Guarantees that all writes and reads go through server-side RBAC and Supabase persistence.
 */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getSupabaseAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const targetUrl = apiUrl(endpoint);

  const response = await fetch(targetUrl, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}
