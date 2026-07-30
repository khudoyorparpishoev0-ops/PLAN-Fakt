/** Клиент API: авторизация (ШАГ 2) и данные экранов (ШАГ 3).
 *  Все защищённые запросы идут через authedReq: подставляет access-токен
 *  активной сессии и один раз прозрачно обновляет пару токенов по refresh
 *  при 401 (протухший access). */

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
  activeSession = s;
}
export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  activeSession = null;
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
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; field?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Ошибка ${res.status}`, e?.field);
  }
  return data as T;
}

/* ── Активная сессия для запросов данных ─────────────────────────────────── */

let activeSession: Session | null = null;
let authLostHandler: (() => void) | null = null;

/** App регистрирует активную сессию (и обработчик потери авторизации). */
export function bindApiSession(s: Session | null, onAuthLost?: () => void) {
  activeSession = s;
  if (onAuthLost) authLostHandler = onAuthLost;
}

let refreshing: Promise<void> | null = null;

/** Запрос с токеном активной сессии; при 401 — одно обновление по refresh. */
async function authedReq<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!activeSession) throw new ApiError(401, 'unauthorized', 'Требуется вход');
  try {
    return await req<T>(path, { ...opts, token: activeSession.accessToken });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !activeSession) throw e;
    try {
      refreshing ??= api.refresh(activeSession.refreshToken).then((s) => { saveSession(s); });
      await refreshing;
    } catch {
      clearSession();
      authLostHandler?.();
      throw e;
    } finally {
      refreshing = null;
    }
    return req<T>(path, { ...opts, token: activeSession.accessToken });
  }
}

/* ── Типы данных (формы ответов сервера, деньги в сомони) ────────────────── */

export type ApiReqKind = 'payment' | 'trip' | 'auto';
export type ApiReqStatus = 'draft' | 'sent' | 'review' | 'approved' | 'rejected';

export interface ApiRequest {
  id: number;
  number: string;
  kind: ApiReqKind;
  status: ApiReqStatus;
  projectId: number | null;
  project: string;
  name: string;
  amount: number | null;
  currency: string | null;
  km: number | null;
  category: string | null;
  counterparty: string | null;
  date: string; // YYYY-MM-DD
  author: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  attachments: { kind: string; fileName: string }[];
}

export interface CreateRequestPayload {
  kind: ApiReqKind;
  projectId?: number;
  name: string;
  amount?: number;
  currency?: string;
  km?: number;
  category?: string;
  counterpartyName?: string;
  attachment?: string;
}

export interface ApiOperation {
  id: number;
  date: string; // YYYY-MM-DD
  account: string | null;
  type: 'in' | 'out' | 'move' | 'accrual';
  isPlan: boolean;
  confirmed: boolean;
  party: string | null;
  article: string | null;
  comment: string | null;
  project: string | null;
  amount: number; // TJS, сомони
}

export interface ApiPlanFactRow {
  n: string;
  cat: string;
  proj: string;
  party: string;
  pdate: string | null; // YYYY-MM-DD
  fdate: string | null;
  plan: number;
  fact: number;
  status: string;
  resp: string;
  pending: boolean;
  reason?: string;
}

export interface ApiProject {
  id: number;
  name: string;
  group: string;
  resp: string;
  status: 'plan' | 'work' | 'done';
  archived: boolean;
  start: string | null;
  end: string | null;
}

export interface ApiDictionaries {
  articles: Record<'income' | 'expense' | 'asset' | 'liability' | 'equity', { name: string; children: string[]; isSystem: boolean }[]>;
  counterparties: { name: string; note: string }[];
  accounts: { name: string; note: string }[];
  entities: { name: string; note: string }[];
  goods: { name: string; note: string }[];
  services: { name: string; note: string }[];
}

export const api = {
  login: (email: string, password: string) =>
    req<Session>('/auth/login', { method: 'POST', body: { email, password } }),

  refresh: (refreshToken: string) =>
    req<Session>('/auth/refresh', { method: 'POST', body: { refreshToken } }),

  me: (token: string) => req<AuthUser>('/auth/me', { token }),

  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    req<Session>('/auth/password', { method: 'POST', token, body: { currentPassword, newPassword } }),

  /* ── Данные (ШАГ 3) ── */

  requests: (filters?: { kind?: ApiReqKind; status?: ApiReqStatus }) => {
    const q = new URLSearchParams();
    if (filters?.kind) q.set('kind', filters.kind);
    if (filters?.status) q.set('status', filters.status);
    const qs = q.toString();
    return authedReq<ApiRequest[]>(`/requests${qs ? `?${qs}` : ''}`);
  },

  createRequest: (payload: CreateRequestPayload) =>
    authedReq<ApiRequest>('/requests', { method: 'POST', body: payload }),

  changeRequestStatus: (id: number, status: 'review' | 'approved' | 'rejected', comment?: string) =>
    authedReq<ApiRequest>(`/requests/${id}/status`, { method: 'PATCH', body: { status, ...(comment ? { comment } : {}) } }),

  deleteRequest: (id: number) => authedReq<void>(`/requests/${id}`, { method: 'DELETE' }),

  operations: () => authedReq<ApiOperation[]>('/operations'),

  planFact: () => authedReq<{ incomes: ApiPlanFactRow[]; expenses: ApiPlanFactRow[] }>('/planfact'),

  projects: () => authedReq<ApiProject[]>('/projects'),

  dictionaries: () => authedReq<ApiDictionaries>('/dictionaries'),

  settings: () => authedReq<{ kmRate: number }>('/settings'),
};
