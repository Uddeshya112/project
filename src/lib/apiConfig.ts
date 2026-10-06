// API Configuration helper for decoupled frontend/backend deployment
export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

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

// Safely intercept window.fetch for /api/ requests without ever risking app startup crash
try {
  if (typeof window !== 'undefined' && API_BASE_URL) {
    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        try {
          let url = input;
          if (typeof url === 'string' && url.startsWith('/api/')) {
            url = `${API_BASE_URL}${url}`;
          } else if (url instanceof URL && url.pathname.startsWith('/api/')) {
            url = new URL(`${API_BASE_URL}${url.pathname}${url.search}`, url.origin);
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
