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

/** Одно прозрачное обновление пары токенов по refresh; false — сессия потеряна. */
async function tryRefresh(): Promise<boolean> {
  if (!activeSession) return false;
  try {
    refreshing ??= api.refresh(activeSession.refreshToken).then((s) => { saveSession(s); });
    await refreshing;
    return true;
  } catch {
    clearSession();
    authLostHandler?.();
    return false;
  } finally {
    refreshing = null;
  }
}

/** Запрос с токеном активной сессии; при 401 — одно обновление по refresh. */
async function authedReq<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!activeSession) throw new ApiError(401, 'unauthorized', 'Требуется вход');
  try {
    return await req<T>(path, { ...opts, token: activeSession.accessToken });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !activeSession) throw e;
    if (!(await tryRefresh())) throw e;
    return req<T>(path, { ...opts, token: activeSession.accessToken });
  }
}

/** «Сырой» запрос с токеном (multipart / скачивание файлов), с тем же
 *  одноразовым обновлением по refresh при 401. */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!activeSession) throw new ApiError(401, 'unauthorized', 'Требуется вход');
  const run = () =>
    fetch(`/api${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${activeSession!.accessToken}` },
    });
  let res: Response;
  try {
    res = await run();
  } catch {
    throw new ApiError(0, 'network_error', 'Сервер недоступен. Проверьте соединение.');
  }
  if (res.status === 401 && (await tryRefresh())) res = await run();
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; field?: string } } | null;
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Ошибка ${res.status}`, data?.error?.field);
  }
  return res;
}

/* ── Типы данных (формы ответов сервера, деньги в сомони) ────────────────── */

export type ApiReqKind = 'payment' | 'trip' | 'auto';
export type ApiReqStatus = 'draft' | 'sent' | 'review' | 'approved' | 'rejected';

export interface ApiAttachment {
  id: number;
  kind: string;
  fileName: string;
  /** false — имя-заглушка из демо-данных, файла в хранилище нет. */
  hasFile: boolean;
}

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
  stornoBy: string | null;
  stornoAt: string | null;
  attachments: ApiAttachment[];
}

/** Загруженный файл (POST /api/uploads) для передачи в POST /api/requests. */
export interface UploadedRef {
  key: string;
  fileName: string;
  mime?: string;
  size?: number;
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
  attachment?: UploadedRef;
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
  /** Для строк из заявок кабинета. */
  requestId?: number;
  storno?: boolean;
  attachments?: { id: number; fileName: string; hasFile: boolean }[];
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
  /** Суммы (сомони) — только для админа/директора. */
  inF?: number;
  outF?: number;
  inP?: number;
  outP?: number;
}

export interface ApiProjectSummary {
  id: number;
  name: string;
  rows: { article: string; type: 'income' | 'expense'; plan: number; fact: number }[];
}

export interface NamedRef { id: number; name: string; note: string }

export interface ApiDictionaries {
  articles: Record<'income' | 'expense' | 'asset' | 'liability' | 'equity', { id: number; name: string; children: { id: number; name: string }[]; isSystem: boolean }[]>;
  counterparties: NamedRef[];
  accounts: NamedRef[];
  entities: NamedRef[];
  goods: NamedRef[];
  services: NamedRef[];
}

/** Фильтры журнала операций (серверные, ТЗ п. 9). */
export interface OperationQuery {
  type?: string[]; // in | out | move | accrual
  confirmed?: boolean;
  dateFrom?: string;
  dateTo?: string;
  account?: number;
  counterparty?: number;
  article?: number;
  project?: number;
  amountMin?: number;
  amountMax?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CreateOperationPayload {
  date: string;
  type: 'in' | 'out';
  isPlan?: boolean;
  amount: number;
  currency?: string;
  rate?: number;
  articleName: string;
  projectId?: number;
  accountId?: number;
  counterpartyName?: string;
  comment?: string;
}

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  mustChangePassword: boolean;
  role: { code: RoleCode; name: string };
}

export interface ApiRate { code: string; name: string; rate: number | null; rateDate: string | null }

export interface ApiAuditRow {
  id: number;
  at: string;
  user: string;
  entity: string;
  entityId: string;
  action: string;
  newValue: unknown;
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

  /** Сторнирование одобренной заявки (директор/админ). */
  stornoRequest: (id: number, comment?: string) =>
    authedReq<ApiRequest>(`/requests/${id}/storno`, { method: 'PATCH', body: comment ? { comment } : {} }),

  operations: (query: OperationQuery = {}) => {
    const q = new URLSearchParams();
    if (query.type?.length) q.set('type', query.type.join(','));
    if (query.confirmed !== undefined) q.set('confirmed', String(query.confirmed));
    if (query.dateFrom) q.set('date_from', query.dateFrom);
    if (query.dateTo) q.set('date_to', query.dateTo);
    if (query.account != null) q.set('account', String(query.account));
    if (query.counterparty != null) q.set('counterparty', String(query.counterparty));
    if (query.article != null) q.set('article', String(query.article));
    if (query.project != null) q.set('project', String(query.project));
    if (query.amountMin != null) q.set('amount_min', String(query.amountMin));
    if (query.amountMax != null) q.set('amount_max', String(query.amountMax));
    if (query.q) q.set('q', query.q);
    if (query.limit != null) q.set('limit', String(query.limit));
    if (query.offset != null) q.set('offset', String(query.offset));
    const qs = q.toString();
    return authedReq<{ rows: ApiOperation[]; total: number }>(`/operations${qs ? `?${qs}` : ''}`);
  },

  createOperation: (payload: CreateOperationPayload) =>
    authedReq<ApiOperation>('/operations', { method: 'POST', body: payload }),

  planFact: () => authedReq<{ incomes: ApiPlanFactRow[]; expenses: ApiPlanFactRow[] }>('/planfact'),

  projects: () => authedReq<ApiProject[]>('/projects'),

  projectSummary: (id: number) => authedReq<ApiProjectSummary>(`/projects/${id}/summary`),

  archiveProject: (id: number, archived: boolean) =>
    authedReq<{ id: number; archived: boolean }>(`/projects/${id}`, { method: 'PATCH', body: { archived } }),

  dictionaries: () => authedReq<ApiDictionaries>('/dictionaries'),

  settings: () => authedReq<{ kmRate: number }>('/settings'),

  updateSettings: (kmRate: number) =>
    authedReq<{ kmRate: number }>('/settings', { method: 'PATCH', body: { kmRate } }),

  rates: () => authedReq<ApiRate[]>('/rates'),

  addRate: (currency: string, date: string, rate: number) =>
    authedReq<{ currency: string; date: string; rate: number }>('/rates', { method: 'POST', body: { currency, date, rate } }),

  audit: (limit = 100) => authedReq<ApiAuditRow[]>(`/audit?limit=${limit}`),

  users: () => authedReq<{ items: ApiUser[] }>('/users'),

  createUser: (payload: { name: string; email: string; phone?: string; role: RoleCode }) =>
    authedReq<{ user: ApiUser; tempPassword: string }>('/users', { method: 'POST', body: payload }),

  updateUser: (id: number, payload: { name?: string; phone?: string; role?: RoleCode; active?: boolean }) =>
    authedReq<ApiUser>(`/users/${id}`, { method: 'PATCH', body: payload }),

  /** Загрузка файла вложения (JPG/PNG/PDF до 10 МБ) → ключ хранилища. */
  upload: async (file: File): Promise<UploadedRef> => {
    const form = new FormData();
    form.append('file', file);
    const res = await authedFetch('/uploads', { method: 'POST', body: form });
    return (await res.json()) as UploadedRef;
  },

  /** Открыть вложение в новой вкладке (файл отдаётся только с токеном). */
  openAttachment: async (id: number): Promise<void> => {
    const res = await authedFetch(`/attachments/${id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  /** Скачать Excel-экспорт (report | projects). */
  downloadExport: async (name: 'report' | 'projects'): Promise<void> => {
    const res = await authedFetch(`/export/${name}.xlsx`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name === 'report' ? 'план-факт.xlsx' : 'проекты.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
