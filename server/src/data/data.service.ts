import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { dateStr, somoni } from '../serialize';

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
  amount: number; // сумма в TJS, сомони
}

/** Данные для чтения: журнал операций, план-факт, проекты, справочники,
 *  настройки. Деньги сериализуются из дирамов в сомони на границе API. */
@Injectable()
export class DataService {
  constructor(private readonly prisma: PrismaService) {}

  async operations(): Promise<OperationRow[]> {
    const rows = await this.prisma.operation.findMany({
      where: { deletedAt: null },
      include: { account: true, counterparty: true, article: true, project: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return rows.map((o) => ({
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
    }));
  }

  /** План-факт: строки из таблицы plans (+ факт-операции по externalRef) и
   *  плановые операции из одобренных заявок (externalRef `req:<номер>`). */
  async planFact(): Promise<{ incomes: PlanFactRow[]; expenses: PlanFactRow[] }> {
    const plans = await this.prisma.plan.findMany({
      where: { deletedAt: null, externalRef: { startsWith: 'plan:' } },
      include: { article: true, project: true },
      orderBy: { externalRef: 'asc' },
    });
    const refs = plans.map((p) => p.externalRef!.slice('plan:'.length));
    const factOps = await this.prisma.operation.findMany({
      where: { deletedAt: null, externalRef: { in: refs } },
      include: { counterparty: true },
    });
    const factByRef = new Map(factOps.map((o) => [o.externalRef!, o]));

    const incomes: PlanFactRow[] = [];
    const expenses: PlanFactRow[] = [];
    for (const p of plans) {
      const n = p.externalRef!.slice('plan:'.length);
      const fact = factByRef.get(n);
      const row: PlanFactRow = {
        n,
        cat: p.article.name,
        proj: p.project?.name ?? 'Без проекта',
        party: fact?.counterparty?.name ?? '—',
        pdate: dateStr(p.planDate),
        fdate: dateStr(p.factDate),
        plan: somoni(p.amountDirams)!,
        fact: fact ? somoni(fact.amountTjsDirams)! : 0,
        status: p.statusLabel ?? '—',
        resp: p.responsibleName ?? '—',
        pending: !fact,
        ...(p.reason ? { reason: p.reason } : {}),
      };
      (p.article.type === 'income' ? incomes : expenses).push(row);
    }

    // Плановые операции из одобренных заявок — в план-факт проекта (ТЗ, п. 8 и 11)
    const requestOps = await this.prisma.operation.findMany({
      where: { deletedAt: null, isPlan: true, externalRef: { startsWith: 'req:' } },
      include: { article: true, project: true },
      orderBy: { id: 'asc' },
    });
    const numbers = requestOps.map((o) => o.externalRef!.slice('req:'.length));
    const requests = await this.prisma.request.findMany({
      where: { number: { in: numbers } },
      include: { author: true },
    });
    const reqByNumber = new Map(requests.map((r) => [r.number, r]));
    for (const o of requestOps) {
      const number = o.externalRef!.slice('req:'.length);
      const req = reqByNumber.get(number);
      expenses.push({
        n: number,
        cat: o.article?.name ?? '—',
        proj: o.project?.name ?? 'Без проекта',
        party: req?.counterpartyName ?? req?.author.name ?? '—',
        pdate: dateStr(o.date),
        fdate: null,
        plan: somoni(o.amountTjsDirams)!,
        fact: 0,
        status: `План · заявка ${number}`,
        resp: req?.author.name ?? '—',
        pending: true,
      });
    }
    return { incomes, expenses };
  }

  /** Проекты (без финансовых сумм — метаданные). Метки-проекты журнала
   *  операций (без группы) не возвращаются. */
  async projects() {
    const rows = await this.prisma.project.findMany({
      where: { deletedAt: null, groupName: { not: null } },
      orderBy: { id: 'asc' },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      group: p.groupName!,
      resp: p.responsibleName ?? '—',
      status: p.status,
      archived: p.archived,
      start: dateStr(p.startDate),
      end: dateStr(p.endDate),
    }));
  }

  /** Справочники: статьи (дерево по типам), контрагенты, счета, юрлица,
   *  товары, услуги. */
  async dictionaries() {
    const [articles, counterparties, accounts, entities, goods, services] = await Promise.all([
      this.prisma.article.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.counterparty.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.account.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.legalEntity.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.good.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.service.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
    ]);
    const byType: Record<string, { name: string; children: string[]; isSystem: boolean }[]> = {
      income: [], expense: [], asset: [], liability: [], equity: [],
    };
    const roots = articles.filter((a) => a.parentId === null);
    for (const root of roots) {
      byType[root.type].push({
        name: root.name,
        children: articles.filter((a) => a.parentId === root.id).map((a) => a.name),
        isSystem: root.isSystem,
      });
    }
    const pair = (rows: { name: string; note: string | null }[]) =>
      rows.map((r) => ({ name: r.name, note: r.note ?? '' }));
    return {
      articles: byType,
      counterparties: pair(counterparties),
      accounts: pair(accounts),
      entities: pair(entities),
      goods: pair(goods),
      services: pair(services),
    };
  }

  /** Настройки: ставка компенсации км (сомони/км; 0 — не задана). */
  async settings(): Promise<{ kmRate: number }> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'km_rate' } });
    return { kmRate: row ? Number(row.value) / 100 : 0 };
  }

  async updateKmRate(kmRate: number): Promise<{ kmRate: number }> {
    const value = String(Math.round(kmRate * 100));
    await this.prisma.setting.upsert({
      where: { key: 'km_rate' },
      update: { value },
      create: { key: 'km_rate', value },
    });
    return { kmRate: Math.round(kmRate * 100) / 100 };
  }
}
