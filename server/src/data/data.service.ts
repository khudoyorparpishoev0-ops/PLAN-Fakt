import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type ArticleType, type ProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { dateStr, somoni } from '../serialize';
import { BASE_CURRENCY, CURRENCY_DISABLED_MESSAGE, currencyAllowed } from '../currency';
import { PF_DEFAULTS, pfStatusLabel, pfValidate, type PfThresholds } from '../pf';
import type { CreateOperationDto, OperationFilters } from './operations.dto';

/** Виды справочников с общим CRUD. */
export type RefKind = 'counterparty' | 'account' | 'entity' | 'good' | 'service' | 'article';
export const REF_KINDS: RefKind[] = ['counterparty', 'account', 'entity', 'good', 'service', 'article'];
const ARTICLE_TYPES: ArticleType[] = ['income', 'expense', 'asset', 'liability', 'equity'];

/** Строка простого справочника (у всех пяти моделей одинаковый набор полей). */
interface RefRow { id: number; name: string; note: string | null; deletedAt: Date | null }
interface RefDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<RefRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<RefRow>;
  update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<RefRow>;
}

export interface ProjectInput {
  name: string;
  group?: string;
  resp?: string;
  status?: string;
  start?: string | null;
  end?: string | null;
}

/** Строка отчёта «План-Факт» — форма экранов «Показатели»/«Расходы»/«План-Факт». */
export interface PlanFactRow {
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
  /** Для строк из заявок кабинета: id заявки и вложения (сторно/просмотр). */
  requestId?: number;
  storno?: boolean;
  attachments?: { id: number; fileName: string; hasFile: boolean }[];
}

/** Показатели дашборда, считаются из данных периода и остатков счетов.
 *  Все суммы — в сомони. */
export interface DashboardMetrics {
  cashBox: number; // касса (наличные)
  cashBank: number; // расчётные счета
  cashTotal: number;
  cashIn: number; // ожидаемые поступления = план − факт по доходам
  cashOut: number; // предстоящие выплаты = план − факт по расходам
  cashFree: number; // свободный остаток = остаток + ожидания − обязательства
  cashGap: boolean; // кассовый разрыв ожидается
  receivable: number; // дебиторская задолженность
  receivableOverdue: number; // из них просрочено (плановая дата прошла)
  payable: number; // кредиторская задолженность
  payableOverdue: number;
  expOver: number; // перерасход = Σ(факт − план), где факт > план
  expSave: number; // экономия по полностью оплаченным строкам
  incForecast: number; // прогноз доходов = факт + ожидаемые поступления
  prevProfitFact: number | null; // прибыль прошлого периода (null — нет данных)
}

/** Строка журнала операций. */
export interface OperationRow {
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
  amount: number; // сумма в TJS, сомони (у сторно — с минусом)
}

function err(status: HttpStatus, code: string, message: string, field?: string): never {
  throw new HttpException({ code, message, ...(field ? { field } : {}) }, status);
}

/** Сегодняшняя дата как UTC-полночь (для полей @db.Date). */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Данные для чтения и журнал операций. Деньги сериализуются из дирамов
 *  в сомони на границе API. */
@Injectable()
export class DataService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Журнал операций: серверные фильтры и пагинация (ТЗ, п. 9–10) ── */

  async operations(f: OperationFilters): Promise<{ rows: OperationRow[]; total: number }> {
    const where: Prisma.OperationWhereInput = { deletedAt: null };
    if (f.type?.length) where.type = { in: f.type };
    if (f.confirmed === 'true') where.status = 'confirmed';
    if (f.confirmed === 'false') where.status = 'unconfirmed';
    if (f.date_from || f.date_to) {
      where.date = {
        ...(f.date_from ? { gte: new Date(f.date_from + 'T00:00:00Z') } : {}),
        ...(f.date_to ? { lte: new Date(f.date_to + 'T00:00:00Z') } : {}),
      };
    }
    if (f.account) where.accountId = f.account;
    if (f.counterparty) where.counterpartyId = f.counterparty;
    if (f.article) where.articleId = f.article;
    if (f.project) where.projectId = f.project;
    if (f.amount_min != null || f.amount_max != null) {
      // Сумма в TJS (дирамы); сторно-минусы сравниваем по модулю на стороне БД нельзя — фильтруем по значению
      where.amountTjsDirams = {
        ...(f.amount_min != null ? { gte: BigInt(Math.round(f.amount_min * 100)) } : {}),
        ...(f.amount_max != null ? { lte: BigInt(Math.round(f.amount_max * 100)) } : {}),
      };
    }
    if (f.excludeArchived) {
      // Отдельным AND: у поиска q уже занят where.OR
      where.AND = [{ OR: [{ projectId: null }, { project: { archived: false } }] }];
    }
    if (f.q?.trim()) {
      const q = f.q.trim();
      where.OR = [
        { comment: { contains: q, mode: 'insensitive' } },
        { externalRef: { contains: q, mode: 'insensitive' } },
        { counterparty: { name: { contains: q, mode: 'insensitive' } } },
        { article: { name: { contains: q, mode: 'insensitive' } } },
        { project: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
    const offset = Math.max(f.offset ?? 0, 0);
    const [rows, total] = await Promise.all([
      this.prisma.operation.findMany({
        where,
        include: { account: true, counterparty: true, article: true, project: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.operation.count({ where }),
    ]);
    return {
      rows: rows.map((o) => ({
        id: o.id,
        date: dateStr(o.date)!,
        account: o.account?.name ?? null,
        type: o.type,
        isPlan: o.isPlan,
        confirmed: o.status === 'confirmed',
        party: o.counterparty?.name ?? null,
        article: o.article?.name ?? null,
        comment: o.comment,
        project: o.project?.name ?? null,
        amount: somoni(o.amountTjsDirams)!,
      })),
      total,
    };
  }

  /** Ручное добавление операции (формы «Новый доход / Новый расход»). */
  async createOperation(userId: number, dto: CreateOperationDto): Promise<OperationRow> {
    const date = new Date(dto.date + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Неверная дата', 'date');
    if (dto.projectId != null) {
      const project = await this.prisma.project.findFirst({ where: { id: dto.projectId, deletedAt: null } });
      if (!project) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Проект не найден', 'projectId');
    }
    if (dto.accountId != null) {
      const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, deletedAt: null } });
      if (!account) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Счёт не найден', 'accountId');
    }

    // Валюту не подменяем молча: при выключенной мультивалютности «1000 USD»
    // превратилось бы в 1000 сомони — цифра та же, смысл другой.
    if (!currencyAllowed(dto.currency))
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'currency_disabled', CURRENCY_DISABLED_MESSAGE, 'currency');

    const currency = dto.currency ?? BASE_CURRENCY;
    let rate = new Prisma.Decimal(1);
    if (currency !== BASE_CURRENCY) {
      if (dto.rate != null && dto.rate > 0) {
        rate = new Prisma.Decimal(String(dto.rate));
      } else {
        const rateRow = await this.prisma.exchangeRate.findFirst({
          where: { currencyCode: currency, rateDate: { lte: date }, deletedAt: null },
          orderBy: { rateDate: 'desc' },
        });
        if (!rateRow)
          err(HttpStatus.UNPROCESSABLE_ENTITY, 'no_exchange_rate', `Не задан курс валюты ${currency} к TJS — укажите курс`, 'rate');
        rate = rateRow.rate;
      }
    }
    const amountDirams = BigInt(Math.round(dto.amount * 100));
    const amountTjsDirams = BigInt(new Prisma.Decimal(amountDirams.toString()).mul(rate).toFixed(0));

    const articleType = dto.type === 'in' ? 'income' : 'expense';
    const article =
      (await this.prisma.article.findFirst({
        where: { name: dto.articleName, type: articleType, deletedAt: null },
      })) ??
      (await this.prisma.article.create({ data: { name: dto.articleName, type: articleType } }));

    let counterpartyId: number | null = null;
    if (dto.counterpartyName?.trim()) {
      const name = dto.counterpartyName.trim();
      const cp = await this.prisma.counterparty.upsert({ where: { name }, update: {}, create: { name } });
      counterpartyId = cp.id;
    }

    const op = await this.prisma.operation.create({
      data: {
        date,
        type: dto.type,
        isPlan: !!dto.isPlan,
        amountDirams,
        currencyCode: currency,
        rate,
        rateDate: date,
        amountTjsDirams,
        // Плановая операция — оплата ещё не подтверждена
        status: dto.isPlan ? 'unconfirmed' : 'confirmed',
        comment: dto.comment?.trim() || null,
        accountId: dto.accountId ?? null,
        counterpartyId,
        articleId: article.id,
        projectId: dto.projectId ?? null,
      },
      include: { account: true, counterparty: true, article: true, project: true },
    });
    await this.prisma.auditLog.create({
      data: {
        userId, entity: 'operation', entityId: String(op.id), action: 'create',
        newValue: {
          date: dto.date, type: dto.type, isPlan: !!dto.isPlan, amount: dto.amount,
          currency, article: dto.articleName, projectId: dto.projectId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      id: op.id, date: dateStr(op.date)!, account: op.account?.name ?? null, type: op.type,
      isPlan: op.isPlan, confirmed: op.status === 'confirmed', party: op.counterparty?.name ?? null,
      article: op.article?.name ?? null, comment: op.comment, project: op.project?.name ?? null,
      amount: somoni(op.amountTjsDirams)!,
    };
  }

  /** Операция из одобренной заявки неизменяема (ТЗ, п. 5): её нельзя
   *  подтвердить, удалить или перенести в другой проект — только сторно. */
  private fromRequest(externalRef: string | null): boolean {
    return !!externalRef?.startsWith('req:');
  }

  /** Карточка операции: полные поля, валюта и курс, история изменений. */
  async operation(id: number) {
    const o = await this.prisma.operation.findFirst({
      where: { id, deletedAt: null },
      include: { account: true, counterparty: true, article: true, project: true },
    });
    if (!o) err(HttpStatus.NOT_FOUND, 'not_found', 'Операция не найдена');
    const [history, attachments] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { deletedAt: null, entity: 'operation', entityId: String(id) },
        include: { user: true },
        orderBy: { id: 'desc' },
        take: 20,
      }),
      this.prisma.attachment.findMany({
        where: { operationId: id, deletedAt: null },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      id: o.id,
      date: dateStr(o.date)!,
      account: o.account?.name ?? null,
      accountId: o.accountId,
      type: o.type,
      isPlan: o.isPlan,
      confirmed: o.status === 'confirmed',
      party: o.counterparty?.name ?? null,
      article: o.article?.name ?? null,
      comment: o.comment,
      project: o.project?.name ?? null,
      projectId: o.projectId,
      amount: somoni(o.amountTjsDirams)!,
      // Сумма в валюте операции и курс на дату (ТЗ, п. 8: мультивалютность)
      amountOriginal: somoni(o.amountDirams)!,
      currency: o.currencyCode,
      rate: Number(o.rate),
      rateDate: dateStr(o.rateDate),
      externalRef: o.externalRef,
      locked: this.fromRequest(o.externalRef),
      createdAt: o.createdAt.toISOString(),
      // Вложения операции (ТЗ, п. 10): скачиваются через GET /attachments/:id
      attachments: attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mime: a.mime,
        size: a.size,
        hasFile: !!a.storageKey,
      })),
      history: history.map((h) => ({
        at: h.createdAt.toISOString(),
        user: h.user?.name ?? '—',
        action: h.action,
        value: h.newValue,
      })),
    };
  }

  /** Массовые действия журнала (ТЗ, п. 3.2): подтвердить оплату, удалить,
   *  сменить проект. Операции из одобренных заявок пропускаются. */
  async bulkOperations(
    userId: number,
    ids: number[],
    action: 'confirm' | 'delete' | 'project',
    projectId?: number,
  ) {
    if (!ids.length) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Не выбрано ни одной операции', 'ids');
    if (action === 'project') {
      if (projectId == null) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Укажите проект', 'projectId');
      const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
      if (!project) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Проект не найден', 'projectId');
    }
    const rows = await this.prisma.operation.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, externalRef: true, status: true },
    });
    const allowed = rows.filter((r) => !this.fromRequest(r.externalRef));
    const skipped = rows.length - allowed.length;
    const targets = allowed.map((r) => r.id);

    if (targets.length) {
      if (action === 'confirm') {
        // Подтверждение оплаты: плановая строка становится фактом
        await this.prisma.operation.updateMany({
          where: { id: { in: targets } },
          data: { status: 'confirmed', isPlan: false },
        });
      } else if (action === 'delete') {
        await this.prisma.operation.updateMany({ where: { id: { in: targets } }, data: { deletedAt: new Date() } });
      } else {
        await this.prisma.operation.updateMany({ where: { id: { in: targets } }, data: { projectId } });
      }
      await this.auditRef(userId, 'operation', targets[0], `bulk_${action}`, { ids: targets, projectId });
    }
    return { updated: targets.length, skipped };
  }

  /* ── План-факт ────────────────────────────────────────────────────────── */

  /** План-факт за период (по умолчанию — все данные) вместе с показателями
   *  дашборда: остатки счетов, ожидания/обязательства, задолженности. */
  async planFact(from?: string, to?: string, opts?: { includeArchived?: boolean }): Promise<{
    incomes: PlanFactRow[]; expenses: PlanFactRow[]; metrics: DashboardMetrics;
  }> {
    const dFrom = from ? new Date(from + 'T00:00:00Z') : undefined;
    const dTo = to ? new Date(to + 'T00:00:00Z') : undefined;
    // На экране архивные проекты участвуют всегда; отдельная опция нужна
    // выгрузке (решение 11: галочка, по умолчанию архив не попадает в файл)
    const includeArchived = opts?.includeArchived ?? true;
    const th = await this.pfThresholds();
    const { incomes, expenses } = await this.planFactRows(dFrom, dTo, th, includeArchived);

    // Прибыль предыдущего периода той же длины — для «К прошлому периоду»
    let prevProfitFact: number | null = null;
    if (dFrom && dTo) {
      const span = dTo.getTime() - dFrom.getTime() + 24 * 3600 * 1000;
      const prev = await this.planFactRows(new Date(dFrom.getTime() - span), new Date(dFrom.getTime() - 24 * 3600 * 1000));
      const sum = (rows: PlanFactRow[], f: (r: PlanFactRow) => number) => rows.reduce((s, r) => s + f(r), 0);
      const inc = sum(prev.incomes, (r) => r.fact);
      const exp = sum(prev.expenses, (r) => r.fact);
      if (prev.incomes.length || prev.expenses.length) prevProfitFact = inc - exp;
    }

    const metrics = await this.dashboardMetrics(incomes, expenses, prevProfitFact);
    return { incomes, expenses, metrics };
  }

  /** Строки план-факта: планы (+ факт-операции по externalRef) и плановые
   *  операции из одобренных заявок (`req:<номер>`, сторно схлопывается). */
  private async planFactRows(from?: Date, to?: Date, th: PfThresholds = PF_DEFAULTS, includeArchived = true): Promise<{ incomes: PlanFactRow[]; expenses: PlanFactRow[] }> {
    /* План-факт строится из ЖИВЫХ данных, а не из сидовых ключей.
     *
     * Раньше сюда попадали только планы с externalRef «plan:…» (их ставил
     * сид), а факт подтягивался по совпадению externalRef операции с хвостом
     * плана. На демо-базе это работало, а на боевой — нет: операция, заведённая
     * в журнале, и план, заведённый в «Планировании», ключей не имеют. Деньги
     * со счёта списывались (карточка «Деньги» считает по операциям напрямую),
     * а расходы и план-факт оставались нулевыми. Найдено заказчиком 04.08.2026
     * на первой реальной операции.
     *
     * Теперь строка план-факта — агрегат по паре (статья, проект):
     *   план  = сумма плановых строк за период (любых: сетка, сид, base);
     *   факт  = сумма подтверждённых НЕплановых операций in/out со статьёй.
     * Плановые операции одобренных заявок (req:) остаются отдельными
     * строками — это обещания оплаты, а не факт.
     *
     * Переводы (type=move) и корректировки в план-факт не попадают: факт
     * фильтруется по type in/out. Неподтверждённая операция — не факт
     * (и в остаток счёта она тоже не входит): обе карточки считают
     * по одному правилу.
     */
    const period = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

    const [plans, factOps] = await Promise.all([
      this.prisma.plan.findMany({
        where: { deletedAt: null, ...(period ? { period } : {}) },
        include: { article: true, project: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.operation.findMany({
        where: {
          deletedAt: null, isPlan: false, status: 'confirmed',
          type: { in: ['in', 'out'] }, articleId: { not: null },
          ...(period ? { date: period } : {}),
        },
        include: { article: true, project: true, counterparty: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    interface Agg {
      article: { id: number; name: string; type: string };
      proj: string | null;
      plan: bigint; fact: bigint;
      pdate: Date | null; fdate: Date | null;
      party: string | null; resp: string | null; reason: string | null;
    }
    const byKey = new Map<string, Agg>();
    const keyOf = (articleId: number, projectName: string | null) => `${articleId}|${projectName ?? ''}`;
    const agg = (articleId: number, article: Agg['article'], projectName: string | null): Agg => {
      const key = keyOf(articleId, projectName);
      let a = byKey.get(key);
      if (!a) {
        a = { article, proj: projectName, plan: 0n, fact: 0n, pdate: null, fdate: null, party: null, resp: null, reason: null };
        byKey.set(key, a);
      }
      return a;
    };

    for (const p of plans) {
      if (!includeArchived && p.project?.archived) continue;
      if (p.article.type !== 'income' && p.article.type !== 'expense') continue;
      const a = agg(p.articleId, p.article, p.project?.name ?? null);
      a.plan += p.amountDirams;
      if (p.planDate && (!a.pdate || p.planDate < a.pdate)) a.pdate = p.planDate;
      if (!a.resp && p.responsibleName) a.resp = p.responsibleName;
      if (!a.reason && p.reason) a.reason = p.reason;
    }
    for (const o of factOps) {
      if (!includeArchived && o.project?.archived) continue;
      const art = o.article!;
      if (art.type !== 'income' && art.type !== 'expense') continue;
      // Доверяем типу статьи: доходная статья копит поступления, расходная — выплаты
      if ((art.type === 'income') !== (o.type === 'in')) continue;
      const a = agg(o.articleId!, art, o.project?.name ?? null);
      a.fact += o.amountTjsDirams; // сторно в базе с минусом — схлопывается само
      if (!a.fdate || o.date > a.fdate) a.fdate = o.date;
      if (o.counterparty?.name) a.party = o.counterparty.name;
    }

    const incomes: PlanFactRow[] = [];
    const expenses: PlanFactRow[] = [];
    for (const a of byKey.values()) {
      const plan = somoni(a.plan)!;
      const fact = somoni(a.fact)!;
      if (plan === 0 && fact === 0) continue; // пустая пара — нечего показывать
      const dir = a.article.type === 'income' ? 'income' : 'expense';
      const row: PlanFactRow = {
        n: `${a.article.id}·${a.proj ?? '—'}`,
        cat: a.article.name,
        proj: a.proj ?? 'Без проекта',
        party: a.party ?? '—',
        pdate: dateStr(a.pdate),
        fdate: dateStr(a.fdate),
        plan,
        fact,
        // Статья без плана, но с фактом — ПОКАЗЫВАЕТСЯ (статус «План не
        // указан»): скрыть её значило бы потерять реальный расход из отчёта
        status: pfStatusLabel(plan, fact === 0 ? null : fact, dir, th),
        resp: a.resp ?? '—',
        pending: fact === 0,
      };
      (dir === 'income' ? incomes : expenses).push(row);
    }
    incomes.sort((x, y) => y.plan - x.plan || y.fact - x.fact);
    expenses.sort((x, y) => y.plan - x.plan || y.fact - x.fact);

    // Плановые операции из одобренных заявок; пара op + storno даёт net 0 —
    // строка остаётся с планом 0 и статусом «Сторнировано»
    const requestOps = await this.prisma.operation.findMany({
      where: {
        deletedAt: null, isPlan: true, externalRef: { startsWith: 'req:' },
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { article: true, project: true },
      orderBy: { id: 'asc' },
    });
    const byNumber = new Map<string, { net: bigint; first: (typeof requestOps)[number]; storned: boolean }>();
    for (const o of requestOps) {
      const number = o.externalRef!.slice('req:'.length).replace(/:storno$/, '');
      const acc = byNumber.get(number);
      if (!acc) byNumber.set(number, { net: o.amountTjsDirams, first: o, storned: o.externalRef!.endsWith(':storno') });
      else {
        acc.net += o.amountTjsDirams;
        acc.storned = acc.storned || o.externalRef!.endsWith(':storno');
      }
    }
    const requests = await this.prisma.request.findMany({
      where: { number: { in: [...byNumber.keys()] } },
      include: { author: true, attachments: { where: { deletedAt: null } } },
    });
    const reqByNumber = new Map(requests.map((r) => [r.number, r]));
    for (const [number, acc] of byNumber) {
      if (!includeArchived && acc.first.project?.archived) continue;
      const req = reqByNumber.get(number);
      expenses.push({
        n: number,
        cat: acc.first.article?.name ?? '—',
        proj: acc.first.project?.name ?? 'Без проекта',
        party: req?.counterpartyName ?? req?.author.name ?? '—',
        pdate: dateStr(acc.first.date),
        fdate: null,
        plan: somoni(acc.net)!,
        fact: 0,
        status: acc.storned ? 'Сторнировано' : `План · заявка ${number}`,
        resp: req?.author.name ?? '—',
        pending: !acc.storned,
        ...(req ? { requestId: req.id } : {}),
        ...(acc.storned ? { storno: true } : {}),
        attachments: (req?.attachments ?? []).map((a) => ({
          id: a.id, fileName: a.fileName, hasFile: !!a.storageKey,
        })),
      });
    }
    return { incomes, expenses };
  }

  /** Показатели дашборда из строк план-факта и остатков счетов.
   *
   *  Бизнес-правила (ТЗ, п. 8; в прототипе на этих местах были константы):
   *  — остаток счёта = входящий остаток + подтверждённые поступления − выплаты;
   *  — ожидаемые поступления / предстоящие выплаты = Σ(план − факт), где план > факт;
   *  — дебиторская/кредиторская задолженность = то же, просрочка — если плановая
   *    дата прошла;
   *  — свободный остаток = остаток счетов + ожидания − обязательства; если он
   *    отрицательный, ожидается кассовый разрыв. */
  private async dashboardMetrics(
    incomes: PlanFactRow[], expenses: PlanFactRow[], prevProfitFact: number | null,
  ): Promise<DashboardMetrics> {
    const accounts = await this.prisma.account.findMany({ where: { deletedAt: null } });
    const moves = await this.prisma.operation.groupBy({
      by: ['accountId', 'type'],
      where: { deletedAt: null, isPlan: false, status: 'confirmed', accountId: { not: null } },
      _sum: { amountTjsDirams: true },
    });
    const balance = new Map<number, bigint>(accounts.map((a) => [a.id, a.openingDirams]));
    for (const m of moves) {
      const cur = balance.get(m.accountId!);
      if (cur === undefined || (m.type !== 'in' && m.type !== 'out')) continue;
      const sum = m._sum.amountTjsDirams ?? 0n;
      balance.set(m.accountId!, m.type === 'in' ? cur + sum : cur - sum);
    }
    const bucket = (kind: string) =>
      somoni(accounts.filter((a) => a.kind === kind).reduce((s, a) => s + (balance.get(a.id) ?? 0n), 0n))!;
    const cashBox = bucket('cash');
    const cashBank = accounts
      .filter((a) => a.kind !== 'cash')
      .reduce((s, a) => s + somoni(balance.get(a.id) ?? 0n)!, 0);

    const today = dateStr(todayUtc())!;
    const shortfall = (rows: PlanFactRow[]) => rows.filter((r) => r.plan > r.fact);
    const sum = (rows: PlanFactRow[]) => rows.reduce((s, r) => s + (r.plan - r.fact), 0);
    const overdue = (rows: PlanFactRow[]) => sum(rows.filter((r) => r.pdate != null && r.pdate < today));

    const incShort = shortfall(incomes);
    const expShort = shortfall(expenses);
    const cashIn = sum(incShort);
    const cashOut = sum(expShort);
    const cashTotal = cashBox + cashBank;
    const cashFree = cashTotal + cashIn - cashOut;

    const expOver = expenses.filter((r) => r.fact > r.plan).reduce((s, r) => s + (r.fact - r.plan), 0);
    // Экономия — только по полностью оплаченным строкам (частичная оплата
    // и ожидание оплаты в экономию не попадают)
    const expSave = expenses
      .filter((r) => r.fact > 0 && r.fact < r.plan && !r.pending && !/Частично/i.test(r.status))
      .reduce((s, r) => s + (r.plan - r.fact), 0);
    const incFact = incomes.reduce((s, r) => s + r.fact, 0);

    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      cashBox: round(cashBox), cashBank: round(cashBank), cashTotal: round(cashTotal),
      cashIn: round(cashIn), cashOut: round(cashOut), cashFree: round(cashFree), cashGap: cashFree < 0,
      receivable: round(cashIn), receivableOverdue: round(overdue(incShort)),
      payable: round(cashOut), payableOverdue: round(overdue(expShort)),
      expOver: round(expOver), expSave: round(expSave),
      incForecast: round(incFact + cashIn),
      prevProfitFact: prevProfitFact == null ? null : round(prevProfitFact),
    };
  }

  /* ── Проекты ──────────────────────────────────────────────────────────── */

  /** Проекты. Метки-проекты журнала (без группы) не возвращаются.
   *  Полные суммы — только админ/директор (ТЗ, п. 8); статусы «Плановый» /
   *  «В работе» вычисляются по наличию фактических платежей. */
  async projects(role: string) {
    const rows = await this.prisma.project.findMany({
      where: { deletedAt: null, groupName: { not: null } },
      orderBy: { id: 'asc' },
    });
    const withSums = role === 'admin' || role === 'director';
    let sums = new Map<number, { inF: bigint; outF: bigint; inP: bigint; outP: bigint; hasFact: boolean }>();
    if (withSums) {
      sums = new Map(rows.map((p) => [p.id, { inF: 0n, outF: 0n, inP: 0n, outP: 0n, hasFact: false }]));
      const ops = await this.prisma.operation.groupBy({
        by: ['projectId', 'type', 'isPlan'],
        where: { deletedAt: null, projectId: { in: rows.map((p) => p.id) } },
        _sum: { amountTjsDirams: true },
      });
      for (const g of ops) {
        const s = sums.get(g.projectId!);
        if (!s || g.type === 'move' || g.type === 'accrual') continue;
        const sum = g._sum.amountTjsDirams ?? 0n;
        if (g.isPlan) {
          if (g.type === 'in') s.inP += sum; else s.outP += sum;
        } else {
          if (g.type === 'in') s.inF += sum; else s.outF += sum;
          if (sum !== 0n) s.hasFact = true;
        }
      }
      const plans = await this.prisma.plan.groupBy({
        by: ['projectId'],
        where: { deletedAt: null, projectId: { in: rows.map((p) => p.id) } },
        _sum: { amountDirams: true },
      });
      // Плановые суммы: строки plans по типу статьи — нужен второй проход с типом
      const planRows = await this.prisma.plan.findMany({
        where: { deletedAt: null, projectId: { in: rows.map((p) => p.id) } },
        include: { article: true },
      });
      void plans;
      for (const pl of planRows) {
        const s = sums.get(pl.projectId!);
        if (!s) continue;
        if (pl.article.type === 'income') s.inP += pl.amountDirams;
        else if (pl.article.type === 'expense') s.outP += pl.amountDirams;
      }
    }
    return rows.map((p) => {
      const s = sums.get(p.id);
      // «Завершён» — вручную; иначе по факту платежей (ТЗ, п. 8)
      const status = p.status === 'done' ? 'done' : s ? (s.hasFact ? 'work' : 'plan') : p.status;
      return {
        id: p.id,
        name: p.name,
        group: p.groupName!,
        resp: p.responsibleName ?? '—',
        status,
        archived: p.archived,
        start: dateStr(p.startDate),
        end: dateStr(p.endDate),
        ...(s
          ? {
              inF: somoni(s.inF)!, outF: somoni(s.outF)!,
              inP: somoni(s.inP)!, outP: somoni(s.outP)!,
            }
          : {}),
      };
    });
  }

  /** Сводка проекта по статьям: план и факт (ТЗ, п. 9: /projects/:id/summary). */
  async projectSummary(id: number) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) err(HttpStatus.NOT_FOUND, 'not_found', 'Проект не найден');
    const [ops, plans] = await Promise.all([
      this.prisma.operation.findMany({
        where: { deletedAt: null, projectId: id, type: { in: ['in', 'out'] } },
        include: { article: true },
      }),
      this.prisma.plan.findMany({ where: { deletedAt: null, projectId: id }, include: { article: true } }),
    ]);
    const byArticle = new Map<string, { article: string; type: 'income' | 'expense'; plan: bigint; fact: bigint }>();
    const bucket = (name: string, type: 'income' | 'expense') => {
      const key = `${type}|${name}`;
      let b = byArticle.get(key);
      if (!b) { b = { article: name, type, plan: 0n, fact: 0n }; byArticle.set(key, b); }
      return b;
    };
    for (const pl of plans) {
      if (pl.article.type !== 'income' && pl.article.type !== 'expense') continue;
      bucket(pl.article.name, pl.article.type).plan += pl.amountDirams;
    }
    for (const op of ops) {
      const type = op.type === 'in' ? 'income' : 'expense';
      const name = op.article?.name ?? 'Без статьи';
      const b = bucket(name, type);
      if (op.isPlan) b.plan += op.amountTjsDirams;
      else b.fact += op.amountTjsDirams;
    }
    const rows = [...byArticle.values()]
      .map((b) => ({ article: b.article, type: b.type, plan: somoni(b.plan)!, fact: somoni(b.fact)! }))
      .sort((a, b) => (a.type === b.type ? b.plan - a.plan : a.type === 'income' ? -1 : 1));
    return { id: project.id, name: project.name, rows };
  }

  async setProjectArchived(userId: number, id: number, archived: boolean) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) err(HttpStatus.NOT_FOUND, 'not_found', 'Проект не найден');
    await this.prisma.project.update({ where: { id }, data: { archived } });
    await this.prisma.auditLog.create({
      data: {
        userId, entity: 'project', entityId: String(id), action: archived ? 'archive' : 'unarchive',
        oldValue: { archived: project.archived } as Prisma.InputJsonValue,
        newValue: { archived } as Prisma.InputJsonValue,
      },
    });
    return { id, archived };
  }

  /* ── Справочники ──────────────────────────────────────────────────────── */

  /** Справочники: статьи (дерево по типам), контрагенты, счета, юрлица,
   *  товары, услуги — с id для форм. */
  async dictionaries() {
    const [articles, counterparties, accounts, entities, goods, services] = await Promise.all([
      this.prisma.article.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.counterparty.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.account.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.legalEntity.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.good.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.service.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
    ]);
    const byType: Record<string, { id: number; name: string; children: { id: number; name: string }[]; isSystem: boolean }[]> = {
      income: [], expense: [], asset: [], liability: [], equity: [],
    };
    const roots = articles.filter((a) => a.parentId === null);
    for (const root of roots) {
      byType[root.type].push({
        id: root.id,
        name: root.name,
        children: articles.filter((a) => a.parentId === root.id).map((a) => ({ id: a.id, name: a.name })),
        isSystem: root.isSystem,
      });
    }
    const pair = (rows: { id: number; name: string; note: string | null }[]) =>
      rows.map((r) => ({ id: r.id, name: r.name, note: r.note ?? '' }));
    return {
      articles: byType,
      counterparties: pair(counterparties),
      accounts: pair(accounts),
      entities: pair(entities),
      goods: pair(goods),
      services: pair(services),
    };
  }

  /* ── CRUD справочников ────────────────────────────────────────────────── */

  /** Создание / переименование / удаление записей справочников.
   *  ТЗ, п. 8: системные статьи и записи, на которые есть ссылки, удалять
   *  нельзя — только архивировать (мягкое удаление недоступно, отдаётся 422). */
  async createRef(userId: number, kind: RefKind, dto: { name?: string; note?: string; type?: string; parentId?: number; kind?: string }) {
    const name = (dto.name ?? '').trim();
    if (name.length < 2) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Название — минимум 2 символа', 'name');
    if (kind === 'article') {
      const type = (dto.type ?? 'expense') as ArticleType;
      if (!ARTICLE_TYPES.includes(type)) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Неверный тип статьи', 'type');
      const exists = await this.prisma.article.findFirst({
        where: { name, type, parentId: dto.parentId ?? null, deletedAt: null },
      });
      if (exists) err(HttpStatus.UNPROCESSABLE_ENTITY, 'name_taken', 'Такая статья уже есть', 'name');
      const row = await this.prisma.article.create({ data: { name, type, parentId: dto.parentId ?? null } });
      await this.auditRef(userId, 'article', row.id, 'create', { name, type });
      return { id: row.id, name: row.name };
    }
    const model = this.refModel(kind);
    const exists = await model.findFirst({ where: { name } });
    if (exists && exists.deletedAt === null) err(HttpStatus.UNPROCESSABLE_ENTITY, 'name_taken', 'Запись с таким названием уже есть', 'name');
    // Для счёта можно задать вид (касса / расчётный счёт) — влияет на карточку «Деньги»
    const extra = kind === 'account' ? { kind: dto.kind === 'cash' || dto.kind === 'bank' ? dto.kind : 'bank' } : {};
    const row = exists
      ? await model.update({ where: { id: exists.id }, data: { note: dto.note ?? null, deletedAt: null, ...extra } })
      : await model.create({ data: { name, note: dto.note ?? null, ...extra } });
    await this.auditRef(userId, kind, row.id, 'create', { name });
    return { id: row.id, name: row.name, note: row.note ?? '' };
  }

  async updateRef(userId: number, kind: RefKind, id: number, dto: { name?: string; note?: string }) {
    if (kind === 'article') {
      const row = await this.prisma.article.findFirst({ where: { id, deletedAt: null } });
      if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Статья не найдена');
      if (row.isSystem) err(HttpStatus.UNPROCESSABLE_ENTITY, 'system_article', 'Системную статью нельзя переименовать');
      const updated = await this.prisma.article.update({
        where: { id },
        data: { ...(dto.name ? { name: dto.name.trim() } : {}) },
      });
      await this.auditRef(userId, 'article', id, 'update', dto);
      return { id: updated.id, name: updated.name };
    }
    const model = this.refModel(kind);
    const row = await model.findFirst({ where: { id, deletedAt: null } });
    if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Запись не найдена');
    const updated = await model.update({
      where: { id },
      data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.note !== undefined ? { note: dto.note || null } : {}) },
    });
    await this.auditRef(userId, kind, id, 'update', dto);
    return { id: updated.id, name: updated.name, note: updated.note ?? '' };
  }

  /** Мягкое удаление; при наличии ссылок или системном признаке — 422. */
  async removeRef(userId: number, kind: RefKind, id: number) {
    if (kind === 'article') {
      const row = await this.prisma.article.findFirst({ where: { id, deletedAt: null }, include: { children: true } });
      if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Статья не найдена');
      if (row.isSystem) err(HttpStatus.UNPROCESSABLE_ENTITY, 'system_article', 'Системную статью удалить нельзя');
      const [ops, plans] = await Promise.all([
        this.prisma.operation.count({ where: { articleId: id, deletedAt: null } }),
        this.prisma.plan.count({ where: { articleId: id, deletedAt: null } }),
      ]);
      if (ops + plans > 0)
        err(HttpStatus.UNPROCESSABLE_ENTITY, 'in_use', `Статья используется (операций: ${ops}, планов: ${plans}) — удаление запрещено`);
      if (row.children.some((c) => c.deletedAt === null))
        err(HttpStatus.UNPROCESSABLE_ENTITY, 'has_children', 'Сначала удалите подстатьи');
      await this.prisma.article.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.auditRef(userId, 'article', id, 'delete', { name: row.name });
      return { id, deleted: true };
    }
    const model = this.refModel(kind);
    const row = await model.findFirst({ where: { id, deletedAt: null } });
    if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Запись не найдена');
    const used =
      kind === 'counterparty' ? await this.prisma.operation.count({ where: { counterpartyId: id, deletedAt: null } })
      : kind === 'account' ? await this.prisma.operation.count({ where: { accountId: id, deletedAt: null } })
      : 0;
    if (used > 0)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'in_use', `Запись используется в операциях (${used}) — удаление запрещено`);
    await model.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditRef(userId, kind, id, 'delete', { name: row.name });
    return { id, deleted: true };
  }

  /** Модель Prisma по виду справочника (у всех одинаковый набор полей,
   *  поэтому приводится к общему интерфейсу RefDelegate). */
  private refModel(kind: Exclude<RefKind, 'article'>): RefDelegate {
    const model =
      kind === 'counterparty' ? this.prisma.counterparty
      : kind === 'account' ? this.prisma.account
      : kind === 'entity' ? this.prisma.legalEntity
      : kind === 'good' ? this.prisma.good
      : this.prisma.service;
    return model as unknown as RefDelegate;
  }

  private async auditRef(userId: number, entity: string, entityId: number, action: string, value: unknown) {
    await this.prisma.auditLog.create({
      data: { userId, entity, entityId: String(entityId), action, newValue: value as Prisma.InputJsonValue },
    });
  }

  /* ── Проекты: создание и правка ───────────────────────────────────────── */

  async createProject(userId: number, dto: ProjectInput) {
    const name = dto.name.trim();
    const exists = await this.prisma.project.findUnique({ where: { name } });
    if (exists && exists.deletedAt === null)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'name_taken', 'Проект с таким названием уже есть', 'name');
    const data = {
      name,
      groupName: dto.group?.trim() || null,
      responsibleName: dto.resp?.trim() || null,
      status: (dto.status ?? 'plan') as ProjectStatus,
      startDate: dto.start ? new Date(dto.start + 'T00:00:00Z') : null,
      endDate: dto.end ? new Date(dto.end + 'T00:00:00Z') : null,
    };
    const row = exists
      ? await this.prisma.project.update({ where: { id: exists.id }, data: { ...data, deletedAt: null } })
      : await this.prisma.project.create({ data });
    await this.auditRef(userId, 'project', row.id, 'create', { name });
    return { id: row.id, name: row.name };
  }

  async updateProject(userId: number, id: number, dto: Partial<ProjectInput>) {
    const row = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Проект не найден');
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.group !== undefined ? { groupName: dto.group.trim() || null } : {}),
        ...(dto.resp !== undefined ? { responsibleName: dto.resp.trim() || null } : {}),
        ...(dto.status ? { status: dto.status as ProjectStatus } : {}),
        ...(dto.start !== undefined ? { startDate: dto.start ? new Date(dto.start + 'T00:00:00Z') : null } : {}),
        ...(dto.end !== undefined ? { endDate: dto.end ? new Date(dto.end + 'T00:00:00Z') : null } : {}),
      },
    });
    await this.auditRef(userId, 'project', id, 'update', dto);
    return { id: updated.id, name: updated.name };
  }

  /** Удаление проекта. По ТЗ (п. 8) удалять то, на что есть ссылки, нельзя —
   *  проект с операциями, планами, заявками, задачами или сделками можно
   *  только убрать в архив. */
  async removeProject(userId: number, id: number) {
    const row = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Проект не найден');
    const [operations, plans, requests, tasks, deals, moves] = await Promise.all([
      this.prisma.operation.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.plan.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.request.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.task.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.deal.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.stockMove.count({ where: { projectId: id, deletedAt: null } }),
    ]);
    const used = operations + plans + requests + tasks + deals + moves;
    if (used > 0) {
      const parts = [
        operations && `операций: ${operations}`,
        plans && `планов: ${plans}`,
        requests && `заявок: ${requests}`,
        tasks && `задач: ${tasks}`,
        deals && `сделок: ${deals}`,
        moves && `движений склада: ${moves}`,
      ].filter(Boolean).join(', ');
      err(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'project_in_use',
        `Проект используется (${parts}) — его можно только убрать в архив`,
      );
    }
    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditRef(userId, 'project', id, 'delete', { name: row.name });
    return { id, deleted: true };
  }

  /* ── Настройки, курсы, аудит ──────────────────────────────────────────── */

  /** Настройки: ставка компенсации км (сомони/км; 0 — не задана)
   *  и пороги статусов План-Факта (проценты; решение заказчика 02.08.2026 —
   *  настраиваемые, поэтому живут в базе, а не в коде). */
  async settings(): Promise<{ kmRate: number; pf: PfThresholds }> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: ['km_rate', 'pf_norm', 'pf_warn', 'pf_check'] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const pct = (key: string, dflt: number) => {
      const v = Number(map.get(key));
      return map.has(key) && Number.isFinite(v) ? v : dflt;
    };
    return {
      kmRate: map.has('km_rate') ? Number(map.get('km_rate')) / 100 : 0,
      pf: {
        norm: pct('pf_norm', PF_DEFAULTS.norm),
        warn: pct('pf_warn', PF_DEFAULTS.warn),
        check: pct('pf_check', PF_DEFAULTS.check),
      },
    };
  }

  /** Пороги План-Факта из настроек — для формулы статусов. */
  private async pfThresholds(): Promise<PfThresholds> {
    return (await this.settings()).pf;
  }

  async updateSettings(dto: { kmRate?: number; pf?: PfThresholds }): Promise<{ kmRate: number; pf: PfThresholds }> {
    const put = async (key: string, value: string) =>
      this.prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    if (dto.kmRate !== undefined) await put('km_rate', String(Math.round(dto.kmRate * 100)));
    if (dto.pf) {
      const bad = pfValidate(dto.pf);
      if (bad) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', bad, 'pf');
      await put('pf_norm', String(dto.pf.norm));
      await put('pf_warn', String(dto.pf.warn));
      await put('pf_check', String(dto.pf.check));
    }
    return this.settings();
  }

  /** Курсы валют: по каждой валюте — последний курс к TJS. */
  async rates() {
    const currencies = await this.prisma.currency.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } });
    const out = [];
    for (const c of currencies) {
      const last = await this.prisma.exchangeRate.findFirst({
        where: { currencyCode: c.code, deletedAt: null },
        orderBy: { rateDate: 'desc' },
      });
      out.push({
        code: c.code,
        name: c.name,
        rate: last ? Number(last.rate) : null,
        rateDate: last ? dateStr(last.rateDate) : null,
      });
    }
    return out;
  }

  async addRate(userId: number, currency: string, date: string, rate: number) {
    const cur = await this.prisma.currency.findFirst({ where: { code: currency, deletedAt: null } });
    if (!cur) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Валюта не найдена', 'currency');
    const rateDate = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(rateDate.getTime())) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Неверная дата', 'date');
    const value = new Prisma.Decimal(String(rate));
    await this.prisma.exchangeRate.upsert({
      where: { currencyCode_rateDate: { currencyCode: currency, rateDate } },
      update: { rate: value, deletedAt: null },
      create: { currencyCode: currency, rateDate, rate: value },
    });
    await this.prisma.auditLog.create({
      data: {
        userId, entity: 'exchange_rate', entityId: `${currency}:${date}`, action: 'set',
        newValue: { currency, date, rate } as Prisma.InputJsonValue,
      },
    });
    return { currency, date, rate };
  }

  /** История действий (аудит-лог) — последние записи. */
  async audit(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({
      where: { deletedAt: null },
      include: { user: true },
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      user: r.user?.name ?? '—',
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      newValue: r.newValue,
    }));
  }

  /** Дата «сегодня» для форм (единый источник — сервер). */
  today(): string {
    return dateStr(todayUtc())!;
  }
}
