/** Клиент API авторизации (ШАГ 2). Данные экранов к API пока не подключены —
 *  это шаг 3; здесь только вход/выход, сессия и смена пароля. */

export type RoleCode = 'admin' | 'director' | 'accountant';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: RoleCode;
  mustChangePassword: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: 'Руководитель',
  director: 'Директор',
  accountant: 'Операционный бухгалтер',
};

const STORAGE_KEY = 'ithona.auth';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Ошибка API в едином формате сервера: { error: { code, message, field? } }. */
export class ApiError extends Error {
  code: string;
  status: number;
  field?: string;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function req<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Сервер недоступен. Проверьте соединение.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; field?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Ошибка ${res.status}`, e?.field);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    req<Session>('/auth/login', { method: 'POST', body: { email, password } }),

  refresh: (refreshToken: string) =>
    req<Session>('/auth/refresh', { method: 'POST', body: { refreshToken } }),

  me: (token: string) => req<AuthUser>('/auth/me', { token }),

  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    req<Session>('/auth/password', { method: 'POST', token, body: { currentPassword, newPassword } }),
};
