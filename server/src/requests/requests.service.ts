import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { dateStr, somoni } from '../serialize';
import { BASE_CURRENCY, CURRENCY_DISABLED_MESSAGE, currencyAllowed } from '../currency';
import type { ChangeRequestStatusDto, CreateRequestDto, UpdateRequestDto } from './requests.dto';

/** Дирамы → сомони (для проверок при правке заявки). */
const somoniOf = (v: bigint | null): number | undefined => (v == null ? undefined : Number(v) / 100);

type Kind = 'payment' | 'trip' | 'auto';
type Status = 'draft' | 'sent' | 'review' | 'approved' | 'rejected';

/** Номер заявки: «З-119» (оплата), «П-055» (поездка), «А-032» (авто). */
const KIND_PREFIX: Record<Kind, string> = { payment: 'З', trip: 'П', auto: 'А' };
const KIND_PAD: Record<Kind, number> = { payment: 0, trip: 3, auto: 3 };

/** Учётная статья плановой операции по виду заявки.
 *  В ТЗ статья не названа («одобрение создаёт плановую операцию расхода
 *  по проекту») — выбраны существующие статьи справочника; вопрос заказчику
 *  зафиксирован в docs/CABINET_DIFF.md. */
const KIND_ARTICLE: Record<Kind, string> = {
  payment: 'Прочие расходы',
  trip: 'Транспортные расходы',
  auto: 'Расходы на обслуживание автотранспорта',
};

const ATTACH_KIND: Record<Kind, string> = { payment: 'doc', trip: 'photo', auto: 'receipt' };

const REQUEST_INCLUDE = {
  project: true,
  author: true,
  decisionBy: true,
  stornoBy: true,
  attachments: { where: { deletedAt: null } },
} satisfies Prisma.RequestInclude;

type RequestRow = Prisma.RequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

export interface RequestDto {
  id: number;
  number: string;
  kind: Kind;
  status: Status;
  projectId: number | null;
  project: string;
  name: string;
  amount: number | null;
  currency: string | null;
  km: number | null;
  category: string | null;
  counterparty: string | null;
  date: string;
  author: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  stornoBy: string | null;
  stornoAt: string | null;
  attachments: { id: number; kind: string; fileName: string; hasFile: boolean }[];
}

/** Сегодняшняя дата как UTC-полночь (для полей @db.Date). */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function err(status: HttpStatus, code: string, message: string, field?: string): never {
  throw new HttpException({ code, message, ...(field ? { field } : {}) }, status);
}

/** Заявки кабинета бухгалтера: создание, списки, решение директора
 *  (одобрение создаёт плановую операцию расхода — ТЗ, п. 8), удаление
 *  черновиков. Все изменения пишутся в аудит-лог. */
@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: RequestRow): RequestDto {
    return {
      id: r.id,
      number: r.number,
      kind: r.kind as Kind,
      status: r.status as Status,
      projectId: r.projectId,
      project: r.project?.name ?? 'Без проекта',
      name: r.name,
      amount: somoni(r.amountDirams),
      currency: r.currencyCode,
      km: r.km,
      category: r.category,
      counterparty: r.counterpartyName,
      date: dateStr(r.requestDate)!,
      author: r.author.name,
      decidedBy: r.decisionBy?.name ?? null,
      decidedAt: r.decisionAt ? r.decisionAt.toISOString() : null,
      decisionComment: r.decisionComment,
      stornoBy: r.stornoBy?.name ?? null,
      stornoAt: r.stornoAt ? r.stornoAt.toISOString() : null,
      attachments: r.attachments.map((a) => ({
        id: a.id, kind: a.kind, fileName: a.fileName, hasFile: !!a.storageKey,
      })),
    };
  }

  private async audit(userId: number, entityId: number | string, action: string, oldValue?: unknown, newValue?: unknown) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        entity: 'request',
        entityId: String(entityId),
        action,
        oldValue: oldValue === undefined ? Prisma.DbNull : (oldValue as Prisma.InputJsonValue),
        newValue: newValue === undefined ? Prisma.DbNull : (newValue as Prisma.InputJsonValue),
      },
    });
  }

  /** Следующий номер по виду: max числового суффикса + 1. */
  private async nextNumber(kind: Kind): Promise<string> {
    const rows = await this.prisma.request.findMany({ where: { kind }, select: { number: true } });
    const max = rows.reduce((m, r) => Math.max(m, parseInt(r.number.replace(/\D+/g, ''), 10) || 0), 0);
    const n = max + 1;
    const pad = KIND_PAD[kind];
    return `${KIND_PREFIX[kind]}-${pad ? String(n).padStart(pad, '0') : String(n)}`;
  }

  async list(user: { sub: number; role: string }, filters: { kind?: string; status?: string }): Promise<RequestDto[]> {
    const where: Prisma.RequestWhereInput = { deletedAt: null };
    // Права из ТЗ (п. 8): бухгалтер видит только свои заявки
    if (user.role === 'accountant') where.authorId = user.sub;
    if (filters.kind) where.kind = filters.kind as Kind;
    if (filters.status) where.status = filters.status as Status;
    const rows = await this.prisma.request.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: { id: 'desc' },
    });
    // Новые сверху: по числовому суффиксу номера («З-119» > «З-118»);
    // сид вставлял фикстуры в обратном порядке, поэтому id не годится
    const suffix = (n: string) => parseInt(n.replace(/\D+/g, ''), 10) || 0;
    rows.sort((a, b) => suffix(b.number) - suffix(a.number) || b.id - a.id);
    return rows.map((r) => this.toDto(r));
  }

  async create(user: { sub: number }, dto: CreateRequestDto): Promise<RequestDto> {
    const kind = dto.kind;
    // Обязательные поля по виду заявки (ТЗ, п. 4.1–4.2)
    if (kind === 'payment' || kind === 'auto') {
      if (dto.amount == null) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Укажите сумму', 'amount');
    }
    if (kind === 'trip') {
      if (dto.km == null) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Укажите километры', 'km');
      if (!dto.attachment) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Приложите фото одометра (км)', 'attachment');
    }
    if (kind === 'auto') {
      if (!dto.category) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Выберите категорию', 'category');
      // ТЗ, п. 4.2: для суммы от 100 TJS чек обязателен
      if ((dto.amount ?? 0) >= 100 && !dto.attachment)
        err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Для суммы от 100 TJS чек обязателен', 'attachment');
    }
    if (dto.projectId != null) {
      const project = await this.prisma.project.findFirst({ where: { id: dto.projectId, deletedAt: null } });
      if (!project) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Проект не найден', 'projectId');
    }

    if (!currencyAllowed(dto.currency))
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'currency_disabled', CURRENCY_DISABLED_MESSAGE, 'currency');

    const amountDirams = dto.amount != null ? BigInt(Math.round(dto.amount * 100)) : null;
    // У поездки суммы нет — только километры, поэтому валюта не заполняется
    const currency = kind === 'trip' ? null : (dto.currency ?? BASE_CURRENCY);

    // Номер: гонка на unique(number) маловероятна, но повторяем до 3 раз
    for (let attempt = 0; ; attempt++) {
      const number = await this.nextNumber(kind);
      try {
        const row = await this.prisma.request.create({
          data: {
            number,
            kind,
            status: 'sent', // форма кабинета отправляет сразу Директору (ТЗ, п. 9: → status "sent")
            authorId: user.sub,
            projectId: dto.projectId ?? null,
            name: dto.name.trim(),
            amountDirams,
            currencyCode: currency,
            km: dto.km ?? null,
            category: dto.category ?? null,
            counterpartyName: dto.counterpartyName?.trim() || null,
            requestDate: todayUtc(),
            attachments: dto.attachment
              ? {
                  create: [{
                    kind: ATTACH_KIND[kind],
                    fileName: dto.attachment.fileName,
                    storageKey: dto.attachment.key,
                    mime: dto.attachment.mime ?? null,
                    size: dto.attachment.size ?? null,
                  }],
                }
              : undefined,
          },
          include: REQUEST_INCLUDE,
        });
        const dtoRow = this.toDto(row);
        await this.audit(user.sub, row.id, 'create', undefined, dtoRow as unknown);
        return dtoRow;
      } catch (e) {
        const unique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!unique || attempt >= 2) throw e;
      }
    }
  }

  /** Правка заявки автором. ТЗ, п. 8: «редактируется автором только в статусе
   *  „Черновик“ / „Отклонено“». С resend = true заявка снова уходит директору. */
  async update(user: { sub: number }, id: number, dto: UpdateRequestDto): Promise<RequestDto> {
    const req = await this.prisma.request.findFirst({ where: { id, deletedAt: null }, include: REQUEST_INCLUDE });
    if (!req || req.authorId !== user.sub) err(HttpStatus.NOT_FOUND, 'not_found', 'Заявка не найдена');
    if (req.status !== 'draft' && req.status !== 'rejected')
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'not_editable', 'Редактировать можно только черновик или отклонённую заявку');

    const kind = req.kind as Kind;
    const amount = dto.amount ?? somoniOf(req.amountDirams);
    // Чек обязателен для авто-расхода от 100 TJS (ТЗ, п. 4.2)
    const hasAttachment = dto.attachment != null || req.attachments.length > 0;
    if (kind === 'auto' && (amount ?? 0) >= 100 && !hasAttachment)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Для суммы от 100 TJS чек обязателен', 'attachment');
    if (kind === 'trip' && !hasAttachment)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Приложите фото одометра (км)', 'attachment');
    if (dto.projectId != null) {
      const project = await this.prisma.project.findFirst({ where: { id: dto.projectId, deletedAt: null } });
      if (!project) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Проект не найден', 'projectId');
    }
    if (!currencyAllowed(dto.currency))
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'currency_disabled', CURRENCY_DISABLED_MESSAGE, 'currency');

    const row = await this.prisma.request.update({
      where: { id },
      data: {
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.amount !== undefined ? { amountDirams: BigInt(Math.round(dto.amount * 100)) } : {}),
        ...(dto.currency !== undefined ? { currencyCode: dto.currency } : {}),
        ...(dto.km !== undefined ? { km: dto.km } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.counterpartyName !== undefined ? { counterpartyName: dto.counterpartyName.trim() || null } : {}),
        // Повторная отправка сбрасывает прежнее решение директора
        ...(dto.resend
          ? { status: 'sent' as Status, decisionById: null, decisionAt: null, decisionComment: null, requestDate: todayUtc() }
          : {}),
        ...(dto.attachment
          ? {
              attachments: {
                // Новый файл заменяет прежний (у заявки одно вложение)
                deleteMany: {},
                create: [{
                  kind: ATTACH_KIND[kind],
                  fileName: dto.attachment.fileName,
                  storageKey: dto.attachment.key,
                  mime: dto.attachment.mime ?? null,
                  size: dto.attachment.size ?? null,
                }],
              },
            }
          : {}),
      },
      include: REQUEST_INCLUDE,
    });
    await this.audit(user.sub, id, dto.resend ? 'resend' : 'update', { status: req.status }, dto as unknown);
    return this.toDto(row);
  }

  /** Решение директора. Переходы (ТЗ, п. 5): Отправлено → На рассмотрении /
   *  Одобрено / Отклонено; На рассмотрении → Одобрено / Отклонено.
   *  «Одобрено» создаёт плановую операцию расхода и далее неизменяемо. */
  async changeStatus(user: { sub: number }, id: number, dto: ChangeRequestStatusDto): Promise<RequestDto> {
    const req = await this.prisma.request.findFirst({ where: { id, deletedAt: null }, include: REQUEST_INCLUDE });
    if (!req) err(HttpStatus.NOT_FOUND, 'not_found', 'Заявка не найдена');

    const from = req.status as Status;
    const to = dto.status;
    const allowed: Record<Status, Status[]> = {
      draft: [], // черновик директору не показывается — сначала отправка автором
      sent: ['review', 'approved', 'rejected'],
      review: ['approved', 'rejected'],
      approved: [], // ТЗ: «Одобрено» неизменяемо (только сторнирование директором)
      rejected: [],
    };
    if (!allowed[from].includes(to)) {
      const message =
        from === 'approved'
          ? 'Одобренная заявка неизменяема (только сторнирование)'
          : `Недопустимый переход статуса: ${from} → ${to}`;
      err(HttpStatus.UNPROCESSABLE_ENTITY, from === 'approved' ? 'request_immutable' : 'invalid_transition', message);
    }

    const decided = to === 'approved' || to === 'rejected';
    const decisionData = decided
      ? { decisionById: user.sub, decisionAt: new Date(), decisionComment: dto.comment?.trim() || null }
      : {};

    if (to !== 'approved') {
      const row = await this.prisma.request.update({
        where: { id },
        data: { status: to, ...decisionData },
        include: REQUEST_INCLUDE,
      });
      await this.audit(user.sub, id, 'status_change', { status: from }, { status: to, comment: dto.comment ?? null });
      return this.toDto(row);
    }

    // ── Одобрение: плановая операция расхода по проекту (ТЗ, п. 8) ──
    const opData = await this.plannedOperationData(req);
    const [row] = await this.prisma.$transaction([
      this.prisma.request.update({
        where: { id },
        data: { status: 'approved', ...decisionData },
        include: REQUEST_INCLUDE,
      }),
      // externalRef `req:<номер>` — идемпотентность (повторное одобрение не задублирует)
      this.prisma.operation.upsert({
        where: { externalRef: `req:${req.number}` },
        update: opData,
        create: { externalRef: `req:${req.number}`, ...opData },
      }),
    ]);
    await this.audit(user.sub, id, 'status_change', { status: from }, {
      status: 'approved',
      comment: dto.comment ?? null,
      plannedOperation: `req:${req.number}`,
    });
    return this.toDto(row);
  }

  /** Данные плановой операции по одобряемой заявке. */
  private async plannedOperationData(req: RequestRow) {
    const kind = req.kind as Kind;
    const date = todayUtc();

    // Сумма: оплата/авто — сумма заявки; поездка — км × ставка компенсации
    // (settings.km_rate, дирам/км; по умолчанию 0 — решение заказчика 30.07.2026)
    let amountDirams: bigint;
    let currency = req.currencyCode ?? 'TJS';
    if (kind === 'trip') {
      const rateSetting = await this.prisma.setting.findUnique({ where: { key: 'km_rate' } });
      const kmRate = BigInt(rateSetting?.value ?? '0');
      amountDirams = BigInt(req.km ?? 0) * kmRate;
      currency = 'TJS';
    } else {
      amountDirams = req.amountDirams ?? 0n;
    }

    // Курс к TJS на дату решения (последний известный не позже даты)
    let rate = new Prisma.Decimal(1);
    if (currency !== 'TJS') {
      const rateRow = await this.prisma.exchangeRate.findFirst({
        where: { currencyCode: currency, rateDate: { lte: date }, deletedAt: null },
        orderBy: { rateDate: 'desc' },
      });
      if (!rateRow)
        err(HttpStatus.UNPROCESSABLE_ENTITY, 'no_exchange_rate', `Не задан курс валюты ${currency} к TJS — добавьте курс и повторите`);
      rate = rateRow.rate;
    }
    const amountTjsDirams = BigInt(new Prisma.Decimal(amountDirams.toString()).mul(rate).toFixed(0));

    const article = await this.findOrCreateArticle(KIND_ARTICLE[kind]);
    const commentParts = [`Заявка ${req.number}`, req.name];
    if (kind === 'trip' && req.km) commentParts.push(`${req.km} км`);
    if (req.counterpartyName) commentParts.push(req.counterpartyName);

    return {
      date,
      type: 'out' as const,
      isPlan: true, // плановая операция — план-факт проекта и журнал
      amountDirams,
      currencyCode: currency,
      rate,
      rateDate: date,
      amountTjsDirams,
      status: 'unconfirmed' as const, // оплата ещё не подтверждена
      comment: commentParts.join(' · '),
      articleId: article.id,
      projectId: req.projectId,
    };
  }

  private async findOrCreateArticle(name: string) {
    const existing = await this.prisma.article.findFirst({
      where: { name, type: 'expense', parentId: null, deletedAt: null },
    });
    if (existing) return existing;
    return this.prisma.article.create({ data: { name, type: 'expense', parentId: null } });
  }

  /** Сторнирование одобренной заявки директором (ТЗ, п. 5: «Одобрено …
   *  неизменяемо (только сторнирование директором)»). Плановая операция
   *  гасится обратной записью — история в журнале сохраняется. */
  async storno(user: { sub: number }, id: number, comment?: string): Promise<RequestDto> {
    const req = await this.prisma.request.findFirst({ where: { id, deletedAt: null }, include: REQUEST_INCLUDE });
    if (!req) err(HttpStatus.NOT_FOUND, 'not_found', 'Заявка не найдена');
    if (req.status !== 'approved')
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'not_approved', 'Сторнировать можно только одобренную заявку');
    if (req.stornoAt)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'already_storno', 'Заявка уже сторнирована');

    const original = await this.prisma.operation.findUnique({ where: { externalRef: `req:${req.number}` } });
    if (!original) err(HttpStatus.UNPROCESSABLE_ENTITY, 'no_operation', 'Плановая операция по заявке не найдена');

    const date = todayUtc();
    const stornoComment = `Сторно · заявка ${req.number} · ${req.name}` + (comment?.trim() ? ` · ${comment.trim()}` : '');
    const [row] = await this.prisma.$transaction([
      this.prisma.request.update({
        where: { id },
        data: { stornoById: user.sub, stornoAt: new Date() },
        include: REQUEST_INCLUDE,
      }),
      // Обратная запись: те же атрибуты, суммы с минусом
      this.prisma.operation.upsert({
        where: { externalRef: `req:${req.number}:storno` },
        update: {},
        create: {
          externalRef: `req:${req.number}:storno`,
          date,
          type: original.type,
          isPlan: true,
          amountDirams: -original.amountDirams,
          currencyCode: original.currencyCode,
          rate: original.rate,
          rateDate: date,
          amountTjsDirams: -original.amountTjsDirams,
          status: 'unconfirmed',
          comment: stornoComment,
          articleId: original.articleId,
          projectId: original.projectId,
        },
      }),
    ]);
    await this.audit(user.sub, id, 'storno', { operation: `req:${req.number}` }, {
      stornoOperation: `req:${req.number}:storno`,
      comment: comment ?? null,
    });
    return this.toDto(row);
  }

  /** Удаление — только автором и только «Черновик» (ТЗ, п. 5). Мягкое. */
  async remove(user: { sub: number; role: string }, id: number): Promise<void> {
    const req = await this.prisma.request.findFirst({ where: { id, deletedAt: null } });
    if (!req || (user.role === 'accountant' && req.authorId !== user.sub))
      err(HttpStatus.NOT_FOUND, 'not_found', 'Заявка не найдена');
    if (req.status !== 'draft')
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'only_draft_deletable', 'Удалять можно только черновик');
    await this.prisma.request.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(user.sub, id, 'delete', { number: req.number, status: req.status });
  }
}
