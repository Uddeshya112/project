// API configuration for the decoupled Vercel frontend and Render backend.
// Authentication is cookie-only; no bearer tokens are read from browser storage.
export const RENDER_BACKEND_URL = 'https://tiet-timetable-km8w.onrender.com';

export const API_BASE_URL = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) return envUrl.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) return RENDER_BACKEND_URL;
  return '';
})();

export function getResolvedApiBaseUrl(): string {
  return API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
}

export function apiUrl(endpoint: string): string {
  if (!endpoint) return getResolvedApiBaseUrl();
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  return `${API_BASE_URL}${clean}`;
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (csrfPromise) return csrfPromise;
  csrfPromise = fetch(apiUrl('/api/auth/csrf'), { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      csrfToken = typeof data?.csrfToken === 'string' ? data.csrfToken : null;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => { csrfPromise = null; });
  return csrfPromise;
}

try {
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url: RequestInfo | URL = input;
      if (typeof url === 'string' && url.startsWith('/api/')) url = apiUrl(url);
      else if (url instanceof URL && url.pathname.startsWith('/api/') && API_BASE_URL) url = new URL(`${API_BASE_URL}${url.pathname}${url.search}`);

      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const isApi = (typeof url === 'string' && url.includes('/api/')) || (url instanceof URL && url.pathname.startsWith('/api/'));
      const isAuthExempt = typeof url === 'string'
        ? /\/api\/auth\/(login|register|csrf|forgot-password|reset-password|google\/start|google\/callback|logout)(\?|$)/.test(url)
        : /\/api\/auth\/(login|register|csrf|forgot-password|reset-password|google\/start|google\/callback|logout)(\?|$)/.test(url.pathname);
      if (isApi && !['GET','HEAD','OPTIONS'].includes(method) && !isAuthExempt) {
        const token = await ensureCsrfToken();
        const headers = new Headers(init?.headers || {});
        if (token) headers.set('X-CSRF-Token', token);
        init = { ...init, headers };
      }
      return originalFetch(url, { ...init, credentials: init?.credentials || 'include' });
    };
  }
} catch {}
