// API Configuration helper for decoupled frontend/backend deployment
export const RENDER_BACKEND_URL = 'https://tiet-timetable-km8w.onrender.com';

export const API_BASE_URL: string = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    // If hosted on production Vercel, route to Render Express backend
    if (window.location.hostname.includes('vercel.app')) {
      return RENDER_BACKEND_URL;
    }
    // If on Google AI Studio preview or localhost, route to same-origin
    if (
      window.location.hostname.includes('run.app') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      return '';
    }
  }
  return RENDER_BACKEND_URL;
})();

export function getResolvedApiBaseUrl(): string {
  return API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : RENDER_BACKEND_URL);
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  console.info('[API BASE URL RESOLVED]', {
    hostname: window.location.hostname,
    resolvedApiBaseUrl: getResolvedApiBaseUrl(),
    isProductionVercel: window.location.hostname.includes('vercel.app'),
  });
}

export function apiUrl(endpoint: string): string {
  try {
    if (!endpoint) return API_BASE_URL;
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${API_BASE_URL}${cleanEndpoint}`;
  } catch {
    return endpoint;
  }
}

/**
 * Safely extract active Supabase session access token from browser storage
 */
export function getActiveSupabaseTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.access_token) return parsed.access_token;
        }
      }
    }
  } catch {}
  return null;
}

// Safely intercept window.fetch for /api/ requests to ensure URL routing & token attachment
try {
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        try {
          let url = input;
          let isApiRequest = false;

          if (typeof url === 'string') {
            if (url.startsWith('/api/')) {
              isApiRequest = true;
              url = apiUrl(url);
            } else if (url.includes('/api/')) {
              isApiRequest = true;
            }
          } else if (url instanceof URL && url.pathname.startsWith('/api/')) {
            isApiRequest = true;
            if (API_BASE_URL) {
              url = new URL(`${API_BASE_URL}${url.pathname}${url.search}`, url.origin);
            }
          }

          // If request is to /api/ and doesn't already have an Authorization header, attach Supabase token
          if (isApiRequest) {
            const currentHeaders = new Headers(init?.headers || {});
            if (!currentHeaders.has('Authorization')) {
              const supaToken = getActiveSupabaseTokenFromStorage();
              if (supaToken) {
                currentHeaders.set('Authorization', `Bearer ${supaToken}`);
              }
            }
            init = {
              ...init,
              headers: currentHeaders,
            };
          }

          return await originalFetch(url, init);
        } catch {
          return originalFetch(input, init);
        }
      };
    }
  }
} catch {
  // Never crash application startup
}
