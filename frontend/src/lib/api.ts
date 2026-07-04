export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nisms_token');
}

/** Platform admins acting on a specific school set this via the school switcher. */
export function getActiveSchoolId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nisms_active_school');
}

export function setActiveSchoolId(schoolId: string | null): void {
  if (schoolId) localStorage.setItem('nisms_active_school', schoolId);
  else localStorage.removeItem('nisms_active_school');
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const activeSchool = getActiveSchoolId();
  if (activeSchool) headers['x-school-id'] = activeSchool;

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('nisms_token');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Request failed', (data as { details?: unknown }).details);
  }
  return data as T;
}
