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

/** Карточка операции (ТЗ, п. 3.2 — клик по строке журнала). */
export interface ApiOperationCard extends ApiOperation {
  accountId: number | null;
  projectId: number | null;
  /** Сумма в валюте операции и курс на дату (ТЗ, п. 8). */
  amountOriginal: number;
  currency: string;
  rate: number;
  rateDate: string | null;
  externalRef: string | null;
  /** Операция из одобренной заявки — правке не подлежит, только сторно. */
  locked: boolean;
  createdAt: string;
  /** Прикреплённые документы (ТЗ, п. 10). */
  attachments: { id: number; fileName: string; mime: string | null; size: number | null; hasFile: boolean }[];
  history: { at: string; user: string; action: string; value: unknown }[];
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

/** Показатели дашборда (считаются сервером из данных периода). */
export interface ApiMetrics {
  cashBox: number;
  cashBank: number;
  cashTotal: number;
  cashIn: number;
  cashOut: number;
  cashFree: number;
  cashGap: boolean;
  receivable: number;
  receivableOverdue: number;
  payable: number;
  payableOverdue: number;
  expOver: number;
  expSave: number;
  incForecast: number;
  prevProfitFact: number | null;
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

/** Виды справочников с общим CRUD (совпадают с путями API). */
export type RefKind = 'counterparty' | 'account' | 'entity' | 'good' | 'service' | 'article';

export interface RefPayload {
  name?: string;
  note?: string;
  /** Статьи: тип и родитель. */
  type?: 'income' | 'expense' | 'asset' | 'liability' | 'equity';
  parentId?: number;
  /** Счета: касса или расчётный счёт. */
  kind?: 'cash' | 'bank';
}

export interface ProjectPayload {
  name: string;
  group?: string;
  resp?: string;
  status?: 'plan' | 'work' | 'done';
  start?: string;
  end?: string;
}

export interface UpdateRequestPayload {
  projectId?: number;
  name?: string;
  amount?: number;
  currency?: string;
  km?: number;
  category?: string;
  counterpartyName?: string;
  attachment?: UploadedRef;
  resend?: boolean;
}

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

/** Исполнитель задачи: имя и роль без контактов (доступно и директору). */
export interface ApiAssignee {
  id: number;
  name: string;
  role: { code: RoleCode; name: string };
}

export interface ApiRate { code: string; name: string; rate: number | null; rateDate: string | null }

/* ── Этап 2: задачи, закупки, склад, клиенты, планирование, уведомления ─── */

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'canceled';

export interface ApiTask {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  dueDate: string | null;
  project: string | null;
  projectId: number | null;
  assignee: string | null;
  assigneeId: number | null;
  author: string;
  doneAt: string | null;
}

export interface TaskPayload {
  title?: string;
  description?: string;
  projectId?: number;
  assigneeId?: number;
  priority?: 'low' | 'normal' | 'high';
  dueDate?: string;
  status?: TaskStatus;
}

export type DealStatus = 'draft' | 'active' | 'done' | 'canceled';

export interface ApiDealPosition {
  id?: number;
  name: string;
  goodId?: number | null;
  qty: number;
  unit: string;
  price: number;
  discountPct: number;
  total?: number;
}

/** Выплата поставщику, привязанная к сделке. */
export interface ApiDealPayment {
  id: number;
  date: string;
  account: string | null;
  party: string | null;
  article: string | null;
  amount: number;
  confirmed: boolean;
}

export interface ApiDeliveryPosition {
  id?: number;
  name: string;
  goodId?: number | null;
  qty: number;
  unit: string;
  price: number;
  total?: number;
}

/** Поставка в рамках сделки: полученные товары и услуги. */
export interface ApiDelivery {
  id: number;
  date: string;
  isPlan: boolean;
  entity: string | null;
  party: string | null;
  project: string | null;
  comment: string | null;
  positions: ApiDeliveryPosition[];
  total: number;
}

export interface ApiDeal {
  id: number;
  number: string;
  title: string;
  status: DealStatus;
  date: string;
  counterparty: string | null;
  counterpartyId: number | null;
  project: string | null;
  projectId: number | null;
  comment: string | null;
  positions: ApiDealPosition[];
  total: number;
  /** Частичные оплаты: сколько мы уже заплатили поставщику. */
  payments: ApiDealPayment[];
  paid: number;
  /** Частичные поставки: сколько поставщик уже отгрузил. */
  deliveries: ApiDelivery[];
  delivered: number;
}

export interface DealPayload {
  title?: string;
  date?: string;
  counterpartyId?: number;
  projectId?: number;
  comment?: string;
  status?: DealStatus;
  positions?: ApiDealPosition[];
}

export interface ApiStockItem {
  id: number;
  name: string;
  note: string;
  sku: string | null;
  unit: string;
  qty: number;
  minQty: number;
  low: boolean;
}

export interface ApiStockMove {
  id: number;
  date: string;
  good: string;
  goodId: number;
  type: 'in' | 'out';
  qty: number;
  unit: string;
  project: string | null;
  deal: string | null;
  comment: string | null;
}

export interface ApiClient {
  id: number;
  name: string;
  note: string;
  kind: 'client' | 'supplier' | 'both';
  inn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact: string | null;
  income: number;
  expense: number;
  deals: number;
}

export interface ApiPlanRow {
  id: number;
  articleId: number;
  article: string;
  type: 'income' | 'expense';
  projectId: number | null;
  project: string;
  amount: number;
  fact: number;
}

export interface ApiPlans {
  period: string;
  rows: ApiPlanRow[];
  articles: { id: number; name: string; type: string }[];
  projects: { id: number; name: string }[];
}

export interface ApiNotification {
  id: string;
  kind: string;
  title: string;
  note: string;
  date: string | null;
}

/** Регулярная выгрузка (ТЗ, п. 11, этап 2). */
export interface ApiSchedule {
  id: number;
  kind: string;
  kindName: string;
  frequency: string;
  frequencyName: string;
  hourUtc: number;
  email: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  lastError: string | null;
}

export interface ApiExportFile {
  id: number;
  kind: string;
  kindName: string;
  fileName: string;
  size: number | null;
  mailStatus: string;
  createdAt: string;
}

export interface ApiSchedules {
  /** Настроен ли SMTP: без него файл просто копится в панели. */
  mailConfigured: boolean;
  kinds: { code: string; name: string }[];
  frequencies: { code: string; name: string }[];
  items: ApiSchedule[];
  files: ApiExportFile[];
}

export interface ApiAuditRow {
  id: number;
  at: string;
  user: string;
  entity: string;
  entityId: string;
  action: string;
  newValue: unknown;
}

/** Фильтры журнала → query-строка (одна и та же для списка и выгрузки). */
function operationsQuery(query: OperationQuery): string {
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
  return q.toString();
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

  /** Массовое одобрение из очереди директора. Непригодные заявки не роняют
   *  пачку — возвращаются в skipped с причиной. */
  approveRequests: (ids: number[]) =>
    authedReq<{ approved: number; skipped: { id: number; reason: string }[] }>(
      '/requests/approve-many', { method: 'PATCH', body: { ids } }),

  /** Сторнирование одобренной заявки (директор/админ). */
  stornoRequest: (id: number, comment?: string) =>
    authedReq<ApiRequest>(`/requests/${id}/storno`, { method: 'PATCH', body: comment ? { comment } : {} }),

  operations: (query: OperationQuery = {}) => {
    const qs = operationsQuery(query);
    return authedReq<{ rows: ApiOperation[]; total: number }>(`/operations${qs ? `?${qs}` : ''}`);
  },

  /** Карточка операции: валюта и курс, признак «из заявки», история. */
  operation: (id: number) => authedReq<ApiOperationCard>(`/operations/${id}`),

  /** Массовые действия журнала: подтвердить, удалить, сменить проект. */
  bulkOperations: (ids: number[], action: 'confirm' | 'delete' | 'project', projectId?: number) =>
    authedReq<{ updated: number; skipped: number }>('/operations/bulk', {
      method: 'PATCH',
      body: { ids, action, ...(projectId != null ? { projectId } : {}) },
    }),

  createOperation: (payload: CreateOperationPayload) =>
    authedReq<ApiOperation>('/operations', { method: 'POST', body: payload }),

  planFact: (range?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (range?.from) q.set('from', range.from);
    if (range?.to) q.set('to', range.to);
    const qs = q.toString();
    return authedReq<{ incomes: ApiPlanFactRow[]; expenses: ApiPlanFactRow[]; metrics: ApiMetrics }>(
      `/planfact${qs ? `?${qs}` : ''}`,
    );
  },

  projects: () => authedReq<ApiProject[]>('/projects'),

  projectSummary: (id: number) => authedReq<ApiProjectSummary>(`/projects/${id}/summary`),

  /** Удаление проекта; занятый ссылками вернёт 422 «project_in_use». */
  removeProject: (id: number) => authedReq<{ id: number; deleted: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  archiveProject: (id: number, archived: boolean) =>
    authedReq<{ id: number; archived: boolean }>(`/projects/${id}`, { method: 'PATCH', body: { archived } }),

  createProject: (payload: ProjectPayload) =>
    authedReq<{ id: number; name: string }>('/projects', { method: 'POST', body: payload }),

  updateProject: (id: number, payload: Partial<ProjectPayload>) =>
    authedReq<{ id: number; name: string }>(`/projects/${id}`, { method: 'PATCH', body: payload }),

  dictionaries: () => authedReq<ApiDictionaries>('/dictionaries'),

  /** Справочники: ввод, правка, удаление (системные и занятые — 422). */
  createRef: (kind: RefKind, payload: RefPayload) =>
    authedReq<NamedRef>(`/dictionaries/${kind}`, { method: 'POST', body: payload }),

  updateRef: (kind: RefKind, id: number, payload: RefPayload) =>
    authedReq<NamedRef>(`/dictionaries/${kind}/${id}`, { method: 'PATCH', body: payload }),

  removeRef: (kind: RefKind, id: number) =>
    authedReq<{ id: number; deleted: boolean }>(`/dictionaries/${kind}/${id}`, { method: 'DELETE' }),

  /** Правка своей заявки (черновик / отклонённая), resend — отправить снова. */
  updateRequest: (id: number, payload: UpdateRequestPayload) =>
    authedReq<ApiRequest>(`/requests/${id}`, { method: 'PATCH', body: payload }),

  settings: () => authedReq<{ kmRate: number }>('/settings'),

  updateSettings: (kmRate: number) =>
    authedReq<{ kmRate: number }>('/settings', { method: 'PATCH', body: { kmRate } }),

  rates: () => authedReq<ApiRate[]>('/rates'),

  addRate: (currency: string, date: string, rate: number) =>
    authedReq<{ currency: string; date: string; rate: number }>('/rates', { method: 'POST', body: { currency, date, rate } }),

  audit: (limit = 100) => authedReq<ApiAuditRow[]>(`/audit?limit=${limit}`),

  /* ── Выгрузки по расписанию ── */

  schedules: () => authedReq<ApiSchedules>('/export/schedules'),

  createSchedule: (payload: { kind: string; frequency: string; hourUtc?: number; email?: string }) =>
    authedReq<{ id: number; nextRunAt: string }>('/export/schedules', { method: 'POST', body: payload }),

  updateSchedule: (id: number, payload: { frequency?: string; hourUtc?: number; email?: string; enabled?: boolean }) =>
    authedReq<{ id: number; enabled: boolean; nextRunAt: string }>(`/export/schedules/${id}`, { method: 'PATCH', body: payload }),

  removeSchedule: (id: number) =>
    authedReq<{ id: number; deleted: boolean }>(`/export/schedules/${id}`, { method: 'DELETE' }),

  /** Сформировать выгрузку немедленно. */
  runSchedule: (id: number) =>
    authedReq<{ id: number; fileName: string; mailStatus: string }>(`/export/schedules/${id}/run`, { method: 'POST' }),

  /** Скачать готовый файл регулярной выгрузки. */
  downloadExportFile: async (id: number, fileName: string): Promise<void> => {
    const res = await authedFetch(`/export/files/${id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  users: () => authedReq<{ items: ApiUser[] }>('/users'),

  /** Кого можно назначить исполнителем задачи (админ и директор). */
  assignees: () => authedReq<{ items: ApiAssignee[] }>('/users/assignees'),

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

  /** Прикрепить загруженный файл к операции журнала. */
  attachToOperation: (operationId: number, file: UploadedRef & { kind?: string }) =>
    authedReq<{ id: number; fileName: string }>(`/operations/${operationId}/attachments`, {
      method: 'POST',
      body: { key: file.key, fileName: file.fileName, mime: file.mime, size: file.size, kind: file.kind ?? 'doc' },
    }),

  /** Открепить вложение операции. */
  removeAttachment: (id: number) =>
    authedReq<{ id: number; deleted: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),

  /** Содержимое вложения как blob-ссылка — для превью прямо в интерфейсе. */
  attachmentUrl: async (id: number): Promise<{ url: string; mime: string }> => {
    const res = await authedFetch(`/attachments/${id}`);
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), mime: blob.type || res.headers.get('Content-Type') || '' };
  },

  /** Открыть вложение в новой вкладке (файл отдаётся только с токеном). */
  openAttachment: async (id: number): Promise<void> => {
    const res = await authedFetch(`/attachments/${id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  /* ── Этап 2 ── */

  tasks: (filters: { status?: string; project?: number; assignee?: number } = {}) => {
    const q = new URLSearchParams();
    if (filters.status) q.set('status', filters.status);
    if (filters.project != null) q.set('project', String(filters.project));
    if (filters.assignee != null) q.set('assignee', String(filters.assignee));
    const qs = q.toString();
    return authedReq<ApiTask[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (payload: TaskPayload) => authedReq<{ id: number }>('/tasks', { method: 'POST', body: payload }),
  updateTask: (id: number, payload: TaskPayload) =>
    authedReq<{ id: number }>(`/tasks/${id}`, { method: 'PATCH', body: payload }),
  removeTask: (id: number) => authedReq<{ id: number }>(`/tasks/${id}`, { method: 'DELETE' }),

  deals: (status?: string) => authedReq<ApiDeal[]>(`/deals${status ? `?status=${status}` : ''}`),
  createDeal: (payload: DealPayload) => authedReq<{ id: number; number: string }>('/deals', { method: 'POST', body: payload }),
  updateDeal: (id: number, payload: DealPayload) =>
    authedReq<{ id: number; closed: boolean }>(`/deals/${id}`, { method: 'PATCH', body: payload }),
  removeDeal: (id: number) => authedReq<{ id: number }>(`/deals/${id}`, { method: 'DELETE' }),

  /** Выплаты журнала, которые можно прикрепить к сделке. */
  paymentCandidates: (dealId: number, limit = 50) =>
    authedReq<ApiDealPayment[]>(`/deals/${dealId}/payment-candidates?limit=${limit}`),

  addPayments: (dealId: number, operationIds: number[]) =>
    authedReq<{ added: number }>(`/deals/${dealId}/payments`, { method: 'POST', body: { operationIds } }),

  removePayment: (dealId: number, operationId: number) =>
    authedReq<{ id: number; detached: boolean }>(`/deals/${dealId}/payments/${operationId}`, { method: 'DELETE' }),

  createDelivery: (dealId: number, payload: {
    date?: string; isPlan?: boolean; entityName?: string; counterpartyId?: number; projectId?: number;
    comment?: string; positions: ApiDeliveryPosition[];
  }) => authedReq<{ id: number; dealId: number; positions: number }>(`/deals/${dealId}/deliveries`, { method: 'POST', body: payload }),

  removeDelivery: (dealId: number, deliveryId: number) =>
    authedReq<{ id: number; deleted: boolean }>(`/deals/${dealId}/deliveries/${deliveryId}`, { method: 'DELETE' }),

  stock: () => authedReq<ApiStockItem[]>('/stock'),
  stockMoves: (goodId?: number) => authedReq<ApiStockMove[]>(`/stock/moves${goodId ? `?good=${goodId}` : ''}`),
  createStockMove: (payload: { goodId: number; type: 'in' | 'out'; qty: number; date?: string; projectId?: number; comment?: string }) =>
    authedReq<{ id: number }>('/stock/moves', { method: 'POST', body: payload }),
  updateGood: (id: number, payload: { sku?: string; unit?: string; minQty?: number }) =>
    authedReq<{ id: number }>(`/stock/goods/${id}`, { method: 'PATCH', body: payload }),

  clients: () => authedReq<ApiClient[]>('/clients'),
  updateClient: (id: number, payload: Partial<Omit<ApiClient, 'id' | 'income' | 'expense' | 'deals'>>) =>
    authedReq<{ id: number }>(`/clients/${id}`, { method: 'PATCH', body: payload }),

  plans: (period: string) => authedReq<ApiPlans>(`/plans?period=${period}`),
  savePlan: (payload: { period: string; articleId: number; projectId?: number; amount: number }) =>
    authedReq<{ id: number }>('/plans', { method: 'POST', body: payload }),
  removePlan: (id: number) => authedReq<{ id: number }>(`/plans/${id}`, { method: 'DELETE' }),

  notifications: () => authedReq<{ items: ApiNotification[]; count: number }>('/notifications'),

  /** Скачать Excel-экспорт (report | projects). */
  downloadExport: async (name: 'report' | 'projects' | 'operations', query?: OperationQuery): Promise<void> => {
    const qs = name === 'operations' && query ? operationsQuery({ ...query, limit: undefined, offset: undefined }) : '';
    const res = await authedFetch(`/export/${name}.xlsx${qs ? `?${qs}` : ''}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name === 'report' ? 'план-факт.xlsx' : name === 'projects' ? 'проекты.xlsx' : 'операции.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
