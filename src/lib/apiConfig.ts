// API Configuration helper for decoupled frontend/backend deployment
export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export function apiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
}

// Automatically intercept window.fetch for /api/ requests to respect VITE_API_BASE_URL in decoupled mode
if (typeof window !== 'undefined' && API_BASE_URL) {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = input;
    if (typeof url === 'string' && url.startsWith('/api/')) {
      url = `${API_BASE_URL}${url}`;
    } else if (url instanceof URL && url.pathname.startsWith('/api/')) {
      url = new URL(`${API_BASE_URL}${url.pathname}${url.search}`, url.origin);
    }
    return originalFetch(url, init);
  };
}
