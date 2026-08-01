import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type DealStatus, type TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { dateStr, somoni } from '../serialize';
import type {
  ClientDto, CreateDealDto, CreateDeliveryDto, CreateTaskDto, DealPositionDto, SavePlanDto,
  StockMoveDto, UpdateDealDto, UpdateGoodDto, UpdateTaskDto,
} from './stage2.dto';

function err(status: HttpStatus, code: string, message: string, field?: string): never {
  throw new HttpException({ code, message, ...(field ? { field } : {}) }, status);
}

const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};
const dateOf = (s?: string) => (s ? new Date(s + 'T00:00:00Z') : todayUtc());
const dec = (v: Prisma.Decimal | number) => Number(v);

/** Модули этапа 2: задачи, закупки, склад, клиенты, планирование, уведомления. */
@Injectable()
export class Stage2Service {
  constructor(private readonly prisma: PrismaService) {}

  private audit(userId: number, entity: string, entityId: number | string, action: string, value?: unknown) {
    return this.prisma.auditLog.create({
      data: {
        userId, entity, entityId: String(entityId), action,
        newValue: value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue),
      },
    });
  }

  /* ── Задачи ───────────────────────────────────────────────────────────── */

  async tasks(filters: { status?: string; assigneeId?: number; projectId?: number }) {
    const rows = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        ...(filters.status ? { status: filters.status as TaskStatus } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
      },
      include: { project: true, assignee: true, author: true },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { id: 'desc' }],
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: dateStr(t.dueDate),
      project: t.project?.name ?? null,
      projectId: t.projectId,
      assignee: t.assignee?.name ?? null,
      assigneeId: t.assigneeId,
      author: t.author.name,
      doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    }));
  }

  async createTask(userId: number, dto: CreateTaskDto) {
    const row = await this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        projectId: dto.projectId ?? null,
        assigneeId: dto.assigneeId ?? null,
        priority: dto.priority ?? 'normal',
        dueDate: dto.dueDate ? dateOf(dto.dueDate) : null,
        authorId: userId,
      },
    });
    await this.audit(userId, 'task', row.id, 'create', { title: row.title });
    return { id: row.id };
  }

  async updateTask(userId: number, id: number, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) err(HttpStatus.NOT_FOUND, 'not_found', 'Задача не найдена');
    const done = dto.status === 'done';
    await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? dateOf(dto.dueDate) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status as TaskStatus, doneAt: done ? new Date() : null } : {}),
      },
    });
    await this.audit(userId, 'task', id, dto.status ? 'status_change' : 'update', dto);
    return { id };
  }

  async removeTask(userId: number, id: number) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) err(HttpStatus.NOT_FOUND, 'not_found', 'Задача не найдена');
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(userId, 'task', id, 'delete', { title: task.title });
    return { id, deleted: true };
  }

  /* ── Закупки: сделки с позициями ──────────────────────────────────────── */

  /** Сумма позиции: количество × цена × (1 − скидка), в дирамах. */
  private positionTotal(p: { qty: Prisma.Decimal | number; priceDirams: bigint; discountPct: Prisma.Decimal | number }): number {
    const gross = dec(p.qty) * Number(p.priceDirams);
    return Math.round(gross * (1 - dec(p.discountPct) / 100));
  }

  async deals(status?: string) {
    const rows = await this.prisma.deal.findMany({
      where: { deletedAt: null, ...(status ? { status: status as DealStatus } : {}) },
      include: {
        counterparty: true,
        project: true,
        positions: { where: { deletedAt: null } },
        payments: {
          where: { deletedAt: null },
          include: { account: true, counterparty: true, article: true },
          orderBy: { date: 'asc' },
        },
        deliveries: {
          where: { deletedAt: null },
          include: {
            counterparty: true,
            project: true,
            positions: { where: { deletedAt: null } },
          },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { id: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id,
      number: d.number,
      title: d.title,
      status: d.status,
      date: dateStr(d.date)!,
      counterparty: d.counterparty?.name ?? null,
      counterpartyId: d.counterpartyId,
      project: d.project?.name ?? null,
      projectId: d.projectId,
      comment: d.comment,
      positions: d.positions.map((p) => ({
        id: p.id, name: p.name, goodId: p.goodId, qty: dec(p.qty), unit: p.unit,
        price: somoni(p.priceDirams)!, discountPct: dec(p.discountPct),
        total: somoni(BigInt(this.positionTotal(p)))!,
      })),
      total: somoni(BigInt(d.positions.reduce((s, p) => s + this.positionTotal(p), 0)))!,
      // Частичные оплаты: привязанные к сделке выплаты из журнала
      payments: d.payments.map((o) => ({
        id: o.id,
        date: dateStr(o.date)!,
        account: o.account?.name ?? null,
        party: o.counterparty?.name ?? null,
        article: o.article?.name ?? null,
        amount: somoni(o.amountTjsDirams)!,
        confirmed: o.status === 'confirmed',
      })),
      paid: somoni(d.payments.reduce((s, o) => s + o.amountTjsDirams, 0n))!,
      // Частичные поставки: полученные от поставщика товары и услуги
      deliveries: d.deliveries.map((v) => ({
        id: v.id,
        date: dateStr(v.date)!,
        isPlan: v.isPlan,
        entity: v.entityName,
        party: v.counterparty?.name ?? null,
        project: v.project?.name ?? null,
        comment: v.comment,
        positions: v.positions.map((p) => ({
          id: p.id, name: p.name, goodId: p.goodId, qty: dec(p.qty), unit: p.unit,
          price: somoni(p.priceDirams)!,
          total: somoni(BigInt(this.deliveryPositionTotal(p)))!,
        })),
        total: somoni(BigInt(v.positions.reduce((s, p) => s + this.deliveryPositionTotal(p), 0)))!,
      })),
      delivered: somoni(
        BigInt(d.deliveries.reduce((s, v) => s + v.positions.reduce((x, p) => x + this.deliveryPositionTotal(p), 0), 0)),
      )!,
    }));
  }

  /** Сумма позиции поставки: количество × цена (скидка учтена в сделке). */
  private deliveryPositionTotal(p: { qty: Prisma.Decimal | number; priceDirams: bigint }): number {
    return Math.round(dec(p.qty) * Number(p.priceDirams));
  }

  private positionData(p: DealPositionDto) {
    return {
      name: p.name.trim(),
      goodId: p.goodId ?? null,
      qty: new Prisma.Decimal(String(p.qty)),
      unit: p.unit ?? 'шт',
      priceDirams: BigInt(Math.round(p.price * 100)),
      discountPct: new Prisma.Decimal(String(p.discountPct ?? 0)),
    };
  }

  /** Следующий номер сделки: СД-001, СД-002… */
  private async nextDealNumber(): Promise<string> {
    const rows = await this.prisma.deal.findMany({ select: { number: true } });
    const max = rows.reduce((m, r) => Math.max(m, parseInt(r.number.replace(/\D+/g, ''), 10) || 0), 0);
    return `СД-${String(max + 1).padStart(3, '0')}`;
  }

  async createDeal(userId: number, dto: CreateDealDto) {
    const number = await this.nextDealNumber();
    const row = await this.prisma.deal.create({
      data: {
        number,
        title: dto.title.trim(),
        date: dateOf(dto.date),
        counterpartyId: dto.counterpartyId ?? null,
        projectId: dto.projectId ?? null,
        comment: dto.comment?.trim() || null,
        authorId: userId,
        positions: dto.positions?.length ? { create: dto.positions.map((p) => this.positionData(p)) } : undefined,
      },
    });
    await this.audit(userId, 'deal', row.id, 'create', { number, title: row.title });
    return { id: row.id, number };
  }

  /** Правка сделки. Закрытие (status = done) приходует позиции на склад. */
  async updateDeal(userId: number, id: number, dto: UpdateDealDto) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, deletedAt: null },
      include: { positions: { where: { deletedAt: null } } },
    });
    if (!deal) err(HttpStatus.NOT_FOUND, 'not_found', 'Сделка не найдена');
    if (deal.status === 'done' && dto.status !== 'canceled' && dto.positions)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'deal_closed', 'Закрытая сделка не редактируется');

    const closing = dto.status === 'done' && deal.status !== 'done';
    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.date !== undefined ? { date: dateOf(dto.date) } : {}),
          ...(dto.counterpartyId !== undefined ? { counterpartyId: dto.counterpartyId } : {}),
          ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment.trim() || null } : {}),
          ...(dto.status !== undefined ? { status: dto.status as DealStatus } : {}),
          ...(dto.positions
            ? { positions: { deleteMany: {}, create: dto.positions.map((p) => this.positionData(p)) } }
            : {}),
        },
      });
      if (closing) {
        // Если по сделке оформлялись поставки, товар уже пришёл на склад по ним —
        // иначе (закупка без поставок) приходуем позиции при закрытии сделки.
        const deliveries = await tx.delivery.count({ where: { dealId: id, deletedAt: null, isPlan: false } });
        if (deliveries === 0) {
          const positions = dto.positions
            ? await tx.dealPosition.findMany({ where: { dealId: id, deletedAt: null } })
            : deal.positions;
          for (const p of positions.filter((x) => x.goodId != null)) {
            await tx.stockMove.create({
              data: {
                goodId: p.goodId!, type: 'in', qty: p.qty, date: todayUtc(),
                comment: `Приход по сделке ${deal.number}`,
                projectId: dto.projectId ?? deal.projectId, dealId: id, userId,
              },
            });
          }
        }
      }
    });
    await this.audit(userId, 'deal', id, closing ? 'close' : 'update', dto);
    return { id, closed: closing };
  }

  async removeDeal(userId: number, id: number) {
    const deal = await this.prisma.deal.findFirst({ where: { id, deletedAt: null } });
    if (!deal) err(HttpStatus.NOT_FOUND, 'not_found', 'Сделка не найдена');
    if (deal.status === 'done')
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'deal_closed', 'Закрытую сделку удалить нельзя — отмените её');
    await this.prisma.deal.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(userId, 'deal', id, 'delete', { number: deal.number });
    return { id, deleted: true };
  }

  /* ── Сделка: частичные оплаты ─────────────────────────────────────────── */

  private async dealOr404(id: number) {
    const deal = await this.prisma.deal.findFirst({ where: { id, deletedAt: null } });
    if (!deal) err(HttpStatus.NOT_FOUND, 'not_found', 'Сделка не найдена');
    return deal;
  }

  /** Выплаты, которые можно прикрепить к сделке: расходные операции,
   *  ещё не привязанные ни к одной сделке. */
  async paymentCandidates(dealId: number, limit = 50) {
    const deal = await this.dealOr404(dealId);
    const rows = await this.prisma.operation.findMany({
      where: {
        deletedAt: null,
        type: 'out',
        dealId: null,
        ...(deal.counterpartyId ? { counterpartyId: deal.counterpartyId } : {}),
      },
      include: { account: true, counterparty: true, article: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((o) => ({
      id: o.id,
      date: dateStr(o.date)!,
      account: o.account?.name ?? null,
      party: o.counterparty?.name ?? null,
      article: o.article?.name ?? null,
      amount: somoni(o.amountTjsDirams)!,
      confirmed: o.status === 'confirmed',
    }));
  }

  /** Прикрепить выплаты к сделке. */
  async addPayments(userId: number, dealId: number, operationIds: number[]) {
    await this.dealOr404(dealId);
    const rows = await this.prisma.operation.findMany({
      where: { id: { in: operationIds }, deletedAt: null },
      select: { id: true, type: true, dealId: true },
    });
    const wrongType = rows.filter((o) => o.type !== 'out');
    if (wrongType.length)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'not_expense', 'К сделке закупки прикрепляются только выплаты', 'ids');
    const busy = rows.filter((o) => o.dealId != null && o.dealId !== dealId);
    if (busy.length)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'already_linked', 'Часть операций уже привязана к другой сделке', 'ids');
    const ids = rows.map((o) => o.id);
    if (!ids.length) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Не выбрано ни одной операции', 'ids');
    await this.prisma.operation.updateMany({ where: { id: { in: ids } }, data: { dealId } });
    await this.audit(userId, 'deal', dealId, 'add_payments', { ids });
    return { added: ids.length };
  }

  /** Открепить выплату от сделки (сама операция остаётся в журнале). */
  async removePayment(userId: number, dealId: number, operationId: number) {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, dealId, deletedAt: null } });
    if (!op) err(HttpStatus.NOT_FOUND, 'not_found', 'Выплата не найдена в этой сделке');
    await this.prisma.operation.update({ where: { id: operationId }, data: { dealId: null } });
    await this.audit(userId, 'deal', dealId, 'remove_payment', { operationId });
    return { id: operationId, detached: true };
  }

  /* ── Сделка: частичные поставки ───────────────────────────────────────── */

  /** Создать поставку. Позиции с товаром из справочника приходуются на склад
   *  (плановая поставка — только документ, склад не трогает). */
  async createDelivery(userId: number, dealId: number, dto: CreateDeliveryDto) {
    const deal = await this.dealOr404(dealId);
    if (!dto.positions?.length)
      err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Добавьте хотя бы одну позицию поставки', 'positions');
    const date = dateOf(dto.date);
    const delivery = await this.prisma.$transaction(async (tx) => {
      const row = await tx.delivery.create({
        data: {
          dealId,
          date,
          isPlan: !!dto.isPlan,
          entityName: dto.entityName?.trim() || null,
          counterpartyId: dto.counterpartyId ?? deal.counterpartyId,
          projectId: dto.projectId ?? deal.projectId,
          comment: dto.comment?.trim() || null,
          authorId: userId,
          positions: {
            create: dto.positions.map((p) => ({
              name: p.name.trim(),
              goodId: p.goodId ?? null,
              qty: new Prisma.Decimal(String(p.qty)),
              unit: p.unit ?? 'шт',
              priceDirams: BigInt(Math.round(p.price * 100)),
            })),
          },
        },
        include: { positions: true },
      });
      if (!row.isPlan) {
        for (const p of row.positions.filter((x) => x.goodId != null)) {
          await tx.stockMove.create({
            data: {
              goodId: p.goodId!, type: 'in', qty: p.qty, date,
              comment: `Поставка по сделке ${deal.number}`,
              projectId: row.projectId, dealId, deliveryId: row.id, userId,
            },
          });
        }
      }
      return row;
    });
    await this.audit(userId, 'delivery', delivery.id, 'create', { dealId, positions: delivery.positions.length });
    return { id: delivery.id, dealId, positions: delivery.positions.length };
  }

  /** Удалить поставку вместе с её приходами на склад. */
  async removeDelivery(userId: number, dealId: number, deliveryId: number) {
    const row = await this.prisma.delivery.findFirst({ where: { id: deliveryId, dealId, deletedAt: null } });
    if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Поставка не найдена');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({ where: { id: deliveryId }, data: { deletedAt: now } });
      await tx.deliveryPosition.updateMany({ where: { deliveryId }, data: { deletedAt: now } });
      // Приходы именно этой поставки снимаем со склада, чтобы остаток остался верным
      await tx.stockMove.updateMany({
        where: { deliveryId, deletedAt: null },
        data: { deletedAt: now },
      });
    });
    await this.audit(userId, 'delivery', deliveryId, 'delete', { dealId });
    return { id: deliveryId, deleted: true };
  }

  /* ── Склад ────────────────────────────────────────────────────────────── */

  /** Остатки по товарам: приходы − расходы, плюс признак «ниже минимума». */
  async stock() {
    const [goods, moves] = await Promise.all([
      this.prisma.good.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
      this.prisma.stockMove.groupBy({
        by: ['goodId', 'type'],
        where: { deletedAt: null },
        _sum: { qty: true },
      }),
    ]);
    const qtyByGood = new Map<number, number>();
    for (const m of moves) {
      const cur = qtyByGood.get(m.goodId) ?? 0;
      const sum = dec(m._sum.qty ?? new Prisma.Decimal(0));
      qtyByGood.set(m.goodId, m.type === 'in' ? cur + sum : cur - sum);
    }
    return goods.map((g) => {
      const qty = qtyByGood.get(g.id) ?? 0;
      const minQty = dec(g.minQty);
      return {
        id: g.id, name: g.name, note: g.note ?? '', sku: g.sku, unit: g.unit,
        qty: Math.round(qty * 1000) / 1000, minQty,
        low: minQty > 0 && qty < minQty,
      };
    });
  }

  async stockMoves(goodId?: number, limit = 100) {
    const rows = await this.prisma.stockMove.findMany({
      where: { deletedAt: null, ...(goodId ? { goodId } : {}) },
      include: { good: true, project: true, deal: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 300),
    });
    return rows.map((m) => ({
      id: m.id, date: dateStr(m.date)!, good: m.good.name, goodId: m.goodId,
      type: m.type as 'in' | 'out', qty: dec(m.qty), unit: m.good.unit,
      project: m.project?.name ?? null, deal: m.deal?.number ?? null, comment: m.comment,
    }));
  }

  async createStockMove(userId: number, dto: StockMoveDto) {
    const good = await this.prisma.good.findFirst({ where: { id: dto.goodId, deletedAt: null } });
    if (!good) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Товар не найден', 'goodId');
    if (dto.type === 'out') {
      // Списать больше, чем есть на складе, нельзя
      const stock = (await this.stock()).find((s) => s.id === dto.goodId);
      if ((stock?.qty ?? 0) < dto.qty)
        err(HttpStatus.UNPROCESSABLE_ENTITY, 'not_enough', `На складе только ${stock?.qty ?? 0} ${good.unit}`, 'qty');
    }
    const row = await this.prisma.stockMove.create({
      data: {
        goodId: dto.goodId, type: dto.type, qty: new Prisma.Decimal(String(dto.qty)),
        date: dateOf(dto.date), projectId: dto.projectId ?? null,
        comment: dto.comment?.trim() || null, userId,
      },
    });
    await this.audit(userId, 'stock_move', row.id, 'create', { good: good.name, type: dto.type, qty: dto.qty });
    return { id: row.id };
  }

  async updateGood(userId: number, id: number, dto: UpdateGoodDto) {
    const good = await this.prisma.good.findFirst({ where: { id, deletedAt: null } });
    if (!good) err(HttpStatus.NOT_FOUND, 'not_found', 'Товар не найден');
    await this.prisma.good.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku.trim() || null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim() || 'шт' } : {}),
        ...(dto.minQty !== undefined ? { minQty: new Prisma.Decimal(String(dto.minQty)) } : {}),
      },
    });
    await this.audit(userId, 'good', id, 'update', dto);
    return { id };
  }

  /* ── Клиенты ──────────────────────────────────────────────────────────── */

  /** Карточки контрагентов с оборотами по операциям. */
  async clients() {
    const [rows, turnover, deals] = await Promise.all([
      this.prisma.counterparty.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
      this.prisma.operation.groupBy({
        by: ['counterpartyId', 'type'],
        where: { deletedAt: null, isPlan: false, counterpartyId: { not: null } },
        _sum: { amountTjsDirams: true },
      }),
      this.prisma.deal.groupBy({
        by: ['counterpartyId'],
        where: { deletedAt: null, counterpartyId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const inSum = new Map<number, bigint>(), outSum = new Map<number, bigint>();
    for (const t of turnover) {
      const target = t.type === 'in' ? inSum : outSum;
      target.set(t.counterpartyId!, (target.get(t.counterpartyId!) ?? 0n) + (t._sum.amountTjsDirams ?? 0n));
    }
    const dealCount = new Map(deals.map((d) => [d.counterpartyId!, d._count._all]));
    return rows.map((c) => ({
      id: c.id, name: c.name, note: c.note ?? '', kind: c.kind,
      inn: c.inn, phone: c.phone, email: c.email, address: c.address, contact: c.contact,
      income: somoni(inSum.get(c.id) ?? 0n)!,
      expense: somoni(outSum.get(c.id) ?? 0n)!,
      deals: dealCount.get(c.id) ?? 0,
    }));
  }

  async updateClient(userId: number, id: number, dto: ClientDto) {
    const row = await this.prisma.counterparty.findFirst({ where: { id, deletedAt: null } });
    if (!row) err(HttpStatus.NOT_FOUND, 'not_found', 'Контрагент не найден');
    await this.prisma.counterparty.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.inn !== undefined ? { inn: dto.inn.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.contact !== undefined ? { contact: dto.contact.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
    });
    await this.audit(userId, 'client', id, 'update', dto);
    return { id };
  }

  /* ── Планирование ─────────────────────────────────────────────────────── */

  /** Планы месяца по статьям и проектам + факт для сравнения. */
  async plans(period: string) {
    const start = new Date(period.slice(0, 7) + '-01T00:00:00Z');
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const [plans, facts, articles, projects] = await Promise.all([
      this.prisma.plan.findMany({
        where: { deletedAt: null, period: { gte: start, lte: end } },
        include: { article: true, project: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.operation.findMany({
        where: { deletedAt: null, isPlan: false, date: { gte: start, lte: end } },
        select: { articleId: true, projectId: true, amountTjsDirams: true },
      }),
      this.prisma.article.findMany({
        where: { deletedAt: null, type: { in: ['income', 'expense'] } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.project.findMany({ where: { deletedAt: null, groupName: { not: null } }, orderBy: { name: 'asc' } }),
    ]);
    const factKey = (a: number | null, p: number | null) => `${a ?? 0}:${p ?? 0}`;
    const factByKey = new Map<string, bigint>();
    for (const f of facts) {
      const k = factKey(f.articleId, f.projectId);
      factByKey.set(k, (factByKey.get(k) ?? 0n) + f.amountTjsDirams);
    }
    return {
      period: dateStr(start)!,
      rows: plans.map((p) => ({
        id: p.id,
        articleId: p.articleId,
        article: p.article.name,
        type: p.article.type as 'income' | 'expense',
        projectId: p.projectId,
        project: p.project?.name ?? 'Без проекта',
        amount: somoni(p.amountDirams)!,
        fact: somoni(factByKey.get(factKey(p.articleId, p.projectId)) ?? 0n)!,
      })),
      articles: articles.map((a) => ({ id: a.id, name: a.name, type: a.type })),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /** Создание или изменение плана (уникален по статье, проекту и месяцу). */
  async savePlan(userId: number, dto: SavePlanDto) {
    const period = new Date(dto.period.slice(0, 7) + '-01T00:00:00Z');
    const article = await this.prisma.article.findFirst({ where: { id: dto.articleId, deletedAt: null } });
    if (!article) err(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', 'Статья не найдена', 'articleId');
    const amountDirams = BigInt(Math.round(dto.amount * 100));
    const existing = await this.prisma.plan.findFirst({
      where: { deletedAt: null, period, articleId: dto.articleId, projectId: dto.projectId ?? null },
    });
    const row = existing
      ? await this.prisma.plan.update({ where: { id: existing.id }, data: { amountDirams } })
      : await this.prisma.plan.create({
          data: { period, articleId: dto.articleId, projectId: dto.projectId ?? null, amountDirams },
        });
    await this.audit(userId, 'plan', row.id, existing ? 'update' : 'create', dto);
    return { id: row.id };
  }

  async removePlan(userId: number, id: number) {
    const plan = await this.prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) err(HttpStatus.NOT_FOUND, 'not_found', 'План не найден');
    await this.prisma.plan.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(userId, 'plan', id, 'delete');
    return { id, deleted: true };
  }

  /* ── Уведомления ──────────────────────────────────────────────────────── */

  /** События для колокольчика: считаются из данных, без отдельной таблицы.
   *  Состав зависит от роли (бухгалтер видит только своё). */
  async notifications(user: { sub: number; role: string }) {
    const today = dateStr(todayUtc())!;
    const items: { id: string; kind: string; title: string; note: string; date: string | null }[] = [];

    if (user.role === 'admin' || user.role === 'director') {
      const pending = await this.prisma.request.findMany({
        where: { deletedAt: null, status: { in: ['sent', 'review'] } },
        include: { author: true },
        orderBy: { id: 'desc' },
        take: 10,
      });
      for (const r of pending) {
        items.push({
          id: `req:${r.id}`, kind: 'request',
          title: `Заявка ${r.number} ждёт решения`,
          note: `${r.name} · от ${r.author.name}`,
          date: dateStr(r.requestDate),
        });
      }
      // Просроченные плановые платежи месяца
      const overduePlans = await this.prisma.plan.findMany({
        where: { deletedAt: null, planDate: { lt: todayUtc() }, factDate: null },
        include: { article: true },
        take: 5,
      });
      for (const p of overduePlans) {
        items.push({
          id: `plan:${p.id}`, kind: 'overdue',
          title: `Просрочен платёж: ${p.article.name}`,
          note: `Плановая дата ${dateStr(p.planDate)}`,
          date: dateStr(p.planDate),
        });
      }
      // Товары ниже минимального остатка
      const low = (await this.stock()).filter((s) => s.low).slice(0, 5);
      for (const s of low) {
        items.push({
          id: `stock:${s.id}`, kind: 'stock',
          title: `Мало на складе: ${s.name}`,
          note: `Остаток ${s.qty} ${s.unit}, минимум ${s.minQty}`,
          date: null,
        });
      }
    } else {
      // Бухгалтер: решения по своим заявкам за последние дни
      const decided = await this.prisma.request.findMany({
        where: { deletedAt: null, authorId: user.sub, status: { in: ['approved', 'rejected'] }, decisionAt: { not: null } },
        orderBy: { decisionAt: 'desc' },
        take: 8,
      });
      for (const r of decided) {
        items.push({
          id: `req:${r.id}`, kind: r.status === 'approved' ? 'approved' : 'rejected',
          title: `Заявка ${r.number}: ${r.status === 'approved' ? 'одобрена' : 'отклонена'}`,
          note: r.name,
          date: r.decisionAt ? dateStr(r.decisionAt) : null,
        });
      }
    }

    // Мои задачи: просроченные и на сегодня
    const myTasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null, assigneeId: user.sub,
        status: { in: ['open', 'in_progress'] },
        dueDate: { not: null, lte: todayUtc() },
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
    });
    for (const t of myTasks) {
      const due = dateStr(t.dueDate)!;
      items.push({
        id: `task:${t.id}`, kind: 'task',
        title: due < today ? `Просрочена задача: ${t.title}` : `Задача на сегодня: ${t.title}`,
        note: `Срок ${due}`,
        date: due,
      });
    }

    // Отметки о прочтении — свои у каждого пользователя. Правило пакета:
    // директор прочитал, у бухгалтера уведомление осталось непрочитанным.
    const read = await this.prisma.notificationRead.findMany({
      where: { userId: user.sub, key: { in: items.map((i) => i.id) } },
      select: { key: true },
    });
    const readKeys = new Set(read.map((r) => r.key));
    const withRead = items.map((i) => ({ ...i, read: readKeys.has(i.id) }));

    // Непрочитанные сверху, внутри — свежие вперёд: колокольчик должен
    // показывать то, что человек ещё не разбирал.
    withRead.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return (b.date ?? '').localeCompare(a.date ?? '');
    });

    return {
      items: withRead,
      // Счётчик колокольчика — только непрочитанные
      count: withRead.filter((i) => !i.read).length,
      total: withRead.length,
    };
  }

  /** Отметить уведомления прочитанными. Без keys — всё, что сейчас в ленте.
   *  Ключи не проверяем на существование: событие могло исчезнуть, пока
   *  человек читал (заявку одобрил кто-то другой), и отметка о нём безвредна. */
  async markNotificationsRead(user: { sub: number; role: string }, keys?: string[]) {
    let list = keys?.filter((k) => typeof k === 'string' && k.length > 0 && k.length <= 64) ?? [];
    if (!list.length) {
      const feed = await this.notifications(user);
      list = feed.items.filter((i) => !i.read).map((i) => i.id);
    }
    if (!list.length) return { read: 0 };
    await this.prisma.notificationRead.createMany({
      data: list.map((key) => ({ userId: user.sub, key })),
      skipDuplicates: true,
    });
    return { read: list.length };
  }
}
