// API routing for the decoupled Vercel frontend and Render API.
// Authentication is cookie-only; this module must never read or write auth tokens.
export const RENDER_BACKEND_URL = 'https://tiet-timetable-km8w.onrender.com';

export const API_BASE_URL: string = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) return envUrl.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app')) return '';
    if (host.endsWith('.vercel.app')) return RENDER_BACKEND_URL;
  }
  return RENDER_BACKEND_URL;
})();

export function getResolvedApiBaseUrl(): string {
  return API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : RENDER_BACKEND_URL);
}

export function apiUrl(endpoint: string): string {
  if (!endpoint) return API_BASE_URL;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${clean}`;
}

// Route API calls through the configured backend and always include its session cookie.
// No bearer token is injected from localStorage/sessionStorage.
try {
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = input instanceof Request ? input.url : String(input);
        const parsed = new URL(url, window.location.origin);
        const isApi = parsed.pathname.startsWith('/api/');
        if (!isApi) return originalFetch(input, init);

        const target = API_BASE_URL
          ? new URL(`${API_BASE_URL}${parsed.pathname}${parsed.search}`)
          : parsed;
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const requestInit: RequestInit = { ...init, headers, credentials: init?.credentials ?? 'include' };
        return originalFetch(target.toString(), requestInit);
      } catch {
        return originalFetch(input, init);
      }
    };
  }
} catch {
  // Never prevent the application from starting.
}
