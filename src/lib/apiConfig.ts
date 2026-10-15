// API Configuration helper for same-origin relative URL routing
export const API_BASE_URL: string = '';

export function getResolvedApiBaseUrl(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function apiUrl(endpoint: string): string {
  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}
