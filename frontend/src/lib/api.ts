/**
 * Empty default = same origin: in production the frontend proxies /api/* to
 * the backend (see next.config.mjs). NEXT_PUBLIC_API_URL overrides for
 * local dev (e.g. http://localhost:4000) or a directly-exposed API.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

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

/**
 * School Context: platform staff are never logged into a school — they operate
 * within an explicitly selected school workspace. This holds that selection.
 */
export function getSchoolContext(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nisms_school_context');
}

export function setSchoolContext(schoolId: string | null): void {
  if (schoolId) localStorage.setItem('nisms_school_context', schoolId);
  else localStorage.removeItem('nisms_school_context');
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const base = API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const schoolContext = getSchoolContext();
  if (schoolContext) headers['x-school-context'] = schoolContext;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network/DNS/offline: never surface "Failed to fetch" to a school user.
    throw new ApiError(0, 'Could not reach the system. Check your internet connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('nisms_token');
      // Each application has its own entry point.
      const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
      if (!window.location.pathname.endsWith('/login')) window.location.href = loginPath;
    }
    const serverMessage = (data as { error?: string }).error;
    // Server messages are written for users; only fall back when there is none.
    const fallback =
      res.status >= 500
        ? 'The system could not complete that request. Please try again in a moment.'
        : 'That request could not be completed.';
    throw new ApiError(res.status, serverMessage ?? fallback, (data as { details?: unknown }).details);
  }
  return data as T;
}
