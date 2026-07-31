/**
 * Seed БД из существующих фикстур фронтенда (src/data/admin.ts, src/data/cabinet.ts),
 * чтобы после подключения API интерфейс показывал те же данные, что и сейчас.
 *
 * Идемпотентен: все записи создаются upsert'ами по уникальным ключам
 * (name / number / code / externalRef) — повторный запуск не плодит дубликаты.
 *
 * Деньги: фикстуры хранят сомони; в БД — дирамы (×100, целые, BigInt).
 *
 * Соответствие названий проектов: в фикстурах встречаются сокращения
 * («Вахдат», «Насосная ст. Вахдат», «ГЭС Помир-1 · 2 оч.») — они приводятся
 * к каноническим проектам через PROJECT_ALIASES; «Компания», «Без проекта»
 * и «—» означают операцию без проекта (project_id = NULL). Метки-проекты из
 * журнала операций («Базар Регар» и т.п.) создаются как проекты в статусе work.
 *
 * Пароли тестовых пользователей берутся из переменных окружения
 * SEED_PASSWORD_ADMIN / SEED_PASSWORD_DIRECTOR / SEED_PASSWORD_ACCOUNTANT;
 * если переменная не задана при создании пользователя — генерируется случайный
 * пароль и печатается в вывод ОДИН раз (при повторных запусках хэш не меняется,
 * пока переменная не задана).
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient, ArticleType, OperationType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { ART, EXPENSES, GEN, INCOMES, OPS, PROJECTS } from '../../src/data/admin';
import { CARS, PAY, TRIPS, type ReqStatus } from '../../src/data/cabinet';

const prisma = new PrismaClient();

/* ── Помощники ──────────────────────────────────────────────────────────── */

/** Сомони → дирамы (целые). */
const dirams = (somoni: number): bigint => BigInt(Math.round(somoni * 100));

const RU_MONTHS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6,
  июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};

const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** «20 ноя 2025» → Date. */
function parseRuDate(s: string): Date {
  const [d, mon, y] = s.split(' ');
  const m = RU_MONTHS[mon.toLowerCase()];
  if (!m) throw new Error(`Не разобрана дата: ${s}`);
  return utcDate(Number(y), m, Number(d));
}

/** «05.10» (+год) или «28.10.2026» → Date; «—» → null. */
function parseDotDate(s: string, defaultYear = 2026): Date | null {
  if (!s || s === '—') return null;
  const p = s.split('.');
  if (p.length === 2) return utcDate(defaultYear, Number(p[1]), Number(p[0]));
  return utcDate(Number(p[2]), Number(p[1]), Number(p[0]));
}

/** Канонизация названий проектов из фикстур. */
const PROJECT_ALIASES: Record<string, string | null> = {
  'Насосная ст. Вахдат': 'Насосная станция Вахдат',
  'Вахдат': 'Насосная станция Вахдат',
  'ГЭС Помир-1 · 2 оч.': 'ГЭС Помир-1',
  'Помир-1': 'ГЭС Помир-1',
  'Компания': null, // общефирменные операции — без проекта
  'Без проекта': null,
  '—': null,
};

const PERIOD = utcDate(2026, 10, 1); // отчётный месяц фикстур — октябрь 2026

const REQ_STATUS: Record<ReqStatus, 'draft' | 'sent' | 'review' | 'approved' | 'rejected'> = {
  'Черновик': 'draft',
  'Отправлено': 'sent',
  'На рассмотрении': 'review',
  'Одобрено': 'approved',
  'Отклонено': 'rejected',
};

/* ── Кэши find-or-create ────────────────────────────────────────────────── */

const projectIds = new Map<string, number>();
const articleIds = new Map<string, number>();
const accountIds = new Map<string, number>();
const counterpartyIds = new Map<string, number>();

async function projectId(rawName: string | undefined | null): Promise<number | null> {
  if (!rawName) return null;
  const name = rawName in PROJECT_ALIASES ? PROJECT_ALIASES[rawName] : rawName;
  if (name === null || name === undefined) return null;
  const cached = projectIds.get(name);
  if (cached) return cached;
  const row = await prisma.project.upsert({
    where: { name },
    update: {},
    create: { name, status: 'work' },
  });
  projectIds.set(name, row.id);
  return row.id;
}

async function articleId(name: string, type: ArticleType, parentId: number | null = null, isSystem = false): Promise<number> {
  const key = `${type}|${parentId ?? 0}|${name}`;
  const cached = articleIds.get(key);
  if (cached) return cached;
  const row = await prisma.article.upsert({
    where: { name_type_parentId: { name, type, parentId: parentId as never } },
    update: { isSystem },
    create: { name, type, parentId, isSystem },
  }).catch(async () => {
    // @@unique с NULL в parentId: в Postgres NULL != NULL, upsert может не найти строку —
    // подстраховка через findFirst.
    const existing = await prisma.article.findFirst({ where: { name, type, parentId } });
    if (existing) return existing;
    return prisma.article.create({ data: { name, type, parentId, isSystem } });
  });
  articleIds.set(key, row.id);
  return row.id;
}

async function accountId(name: string): Promise<number> {
  const cached = accountIds.get(name);
  if (cached) return cached;
  // Вид счёта для счетов из журнала («Наличный», «Касса», «Электронный»):
  // наличные — касса, остальное — банк (карточка «Деньги» показывает раздельно).
  const kind = /касс|наличн/i.test(name) ? 'cash' : 'bank';
  const row = await prisma.account.upsert({ where: { name }, update: {}, create: { name, kind } });
  accountIds.set(name, row.id);
  return row.id;
}

async function counterpartyId(rawName: string | undefined | null): Promise<number | null> {
  if (!rawName || rawName === '—') return null;
  const cached = counterpartyIds.get(rawName);
  if (cached) return cached;
  const row = await prisma.counterparty.upsert({ where: { name: rawName }, update: {}, create: { name: rawName } });
  counterpartyIds.set(rawName, row.id);
  return row.id;
}

/* ── Блоки seed ─────────────────────────────────────────────────────────── */

async function seedRolesAndUsers() {
  const roles: Array<[string, string]> = [
    ['admin', 'Администратор / Руководитель'],
    ['director', 'Директор'],
    ['accountant', 'Операционный бухгалтер'],
  ];
  for (const [code, name] of roles) {
    await prisma.role.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  const users: Array<{ email: string; name: string; role: string; envVar: string }> = [
    { email: 'admin@it-hona.tj', name: 'Руслан Рахмонов', role: 'admin', envVar: 'SEED_PASSWORD_ADMIN' },
    { email: 'director@it-hona.tj', name: 'Р. Рахмонов', role: 'director', envVar: 'SEED_PASSWORD_DIRECTOR' },
    { email: 'accountant@it-hona.tj', name: 'Фаридун', role: 'accountant', envVar: 'SEED_PASSWORD_ACCOUNTANT' },
  ];
  for (const u of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    const envPassword = process.env[u.envVar]?.trim();
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      const password = envPassword || randomBytes(9).toString('base64url');
      if (!envPassword) {
        console.log(`  [seed] Пароль для ${u.email} (сгенерирован, сохраните): ${password}`);
      }
      // Пароль из seed — временный: mustChangePassword=true (default схемы)
      await prisma.user.create({
        data: { email: u.email, name: u.name, roleId: role.id, passwordHash: await bcrypt.hash(password, 10) },
      });
      continue;
    }
    await prisma.user.update({ where: { email: u.email }, data: { name: u.name, roleId: role.id } });
    if (!envPassword) continue;
    // Пользователь уже сменил пароль в интерфейсе — seed его не перетирает
    if (existing.passwordChangedAt) {
      const same = existing.passwordHash && (await bcrypt.compare(envPassword, existing.passwordHash));
      if (!same) {
        console.log(`  [seed] ${u.email}: пароль изменён пользователем — значение ${u.envVar} игнорируется`);
      }
      continue;
    }
    // SEED_PASSWORD_* изменился — обновляем хэш (bcrypt.compare, чтобы не
    // перезаписывать одинаковый пароль новым хэшем на каждом запуске)
    const unchanged = existing.passwordHash && (await bcrypt.compare(envPassword, existing.passwordHash));
    if (!unchanged) {
      await prisma.user.update({
        where: { email: u.email },
        data: { passwordHash: await bcrypt.hash(envPassword, 10), mustChangePassword: true },
      });
      console.log(`  [seed] ${u.email}: пароль обновлён из ${u.envVar} (временный, сменить при входе)`);
    }
  }
}

async function seedCurrencies() {
  const list: Array<[string, string]> = [
    ['TJS', 'Сомони'], ['USD', 'Доллар США'], ['EUR', 'Евро'], ['RUB', 'Российский рубль'], ['CNY', 'Юань'],
  ];
  for (const [code, name] of list) {
    await prisma.currency.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  await prisma.exchangeRate.upsert({
    where: { currencyCode_rateDate: { currencyCode: 'TJS', rateDate: PERIOD } },
    update: { rate: new Prisma.Decimal(1) },
    create: { currencyCode: 'TJS', rateDate: PERIOD, rate: new Prisma.Decimal(1) },
  });
}

async function seedDictionaries() {
  for (const [name, note] of GEN.contragents.rows) {
    await prisma.counterparty.upsert({ where: { name }, update: { note }, create: { name, note } });
    counterpartyIds.delete(name);
  }
  for (const [name, note] of GEN.accounts.rows) {
    // Вид счёта и входящий остаток разбираются из подписи справочника
    // («Расчётный счёт · остаток 512 600 смн» → bank, 512 600).
    const kind = note.startsWith('Наличные') ? 'cash' : note.startsWith('Расчётный счёт') ? 'bank' : 'other';
    const opening = Number(note.match(/остаток\s+([\d\s]+)/)?.[1]?.replace(/\s/g, '') ?? 0);
    const data = { note, kind, openingDirams: dirams(opening) };
    await prisma.account.upsert({ where: { name }, update: data, create: { name, ...data } });
    accountIds.delete(name);
  }
  for (const [name, note] of GEN.entities.rows) {
    await prisma.legalEntity.upsert({ where: { name }, update: { note }, create: { name, note } });
  }
  for (const [name, note] of GEN.goods.rows) {
    await prisma.good.upsert({ where: { name }, update: { note }, create: { name, note } });
  }
  for (const [name, note] of GEN.services.rows) {
    await prisma.service.upsert({ where: { name }, update: { note }, create: { name, note } });
  }
}

/** Настройки: ставка компенсации км (дирам/км). Существующее значение не трогаем. */
async function seedSettings() {
  const existing = await prisma.setting.findUnique({ where: { key: 'km_rate' } });
  if (!existing) await prisma.setting.create({ data: { key: 'km_rate', value: '0' } });
}

async function seedArticles() {
  const TYPE_BY_TAB: Record<string, ArticleType> = {
    'Доходы': 'income', 'Расходы': 'expense', 'Активы': 'asset',
    'Обязательства': 'liability', 'Капитал': 'equity',
  };
  for (const [tab, rows] of Object.entries(ART)) {
    const type = TYPE_BY_TAB[tab];
    for (const [name, children, isSystem] of rows) {
      const parent = await articleId(name, type, null, isSystem);
      for (const child of children) {
        await articleId(child, type, parent, false);
      }
    }
  }
}

async function seedProjects() {
  for (const p of PROJECTS) {
    const row = await prisma.project.upsert({
      where: { name: p.name },
      update: {
        groupName: p.group, responsibleName: p.resp, status: p.status,
        archived: !!p.archived,
        startDate: p.s ? new Date(p.s + 'T00:00:00Z') : null,
        endDate: p.e ? new Date(p.e + 'T00:00:00Z') : null,
      },
      create: {
        name: p.name, groupName: p.group, responsibleName: p.resp, status: p.status,
        archived: !!p.archived,
        startDate: p.s ? new Date(p.s + 'T00:00:00Z') : null,
        endDate: p.e ? new Date(p.e + 'T00:00:00Z') : null,
      },
    });
    projectIds.set(p.name, row.id);
  }
}

/** План-факт по категориям (экраны «Показатели»/«Расходы»): план → plans, факт → operations. */
async function seedPlanFact() {
  for (const r of INCOMES) {
    const artId = await articleId(r.cat, 'income');
    const projId = await projectId(r.proj);
    const planData = {
      articleId: artId, projectId: projId, period: PERIOD, amountDirams: dirams(r.plan),
      planDate: parseDotDate(r.pdate), factDate: parseDotDate(r.fdate),
      statusLabel: r.status, responsibleName: r.resp,
    };
    await prisma.plan.upsert({
      where: { externalRef: `plan:${r.n}` },
      update: planData,
      create: { externalRef: `plan:${r.n}`, ...planData },
    });
    if (r.fact > 0) {
      const date = parseDotDate(r.fdate) ?? parseDotDate(r.pdate) ?? PERIOD;
      const data = {
        date, type: 'in' as OperationType, isPlan: false,
        amountDirams: dirams(r.fact), currencyCode: 'TJS',
        rate: new Prisma.Decimal(1), rateDate: date, amountTjsDirams: dirams(r.fact),
        status: 'confirmed' as const, comment: r.cat,
        articleId: artId, projectId: projId,
        counterpartyId: await counterpartyId(r.party),
      };
      await prisma.operation.upsert({ where: { externalRef: r.n }, update: data, create: { externalRef: r.n, ...data } });
    }
  }
  for (const r of EXPENSES) {
    const artId = await articleId(r.cat, 'expense');
    const projId = await projectId(r.proj);
    const planData = {
      articleId: artId, projectId: projId, period: PERIOD, amountDirams: dirams(r.plan),
      planDate: parseDotDate(r.pdate), factDate: parseDotDate(r.fdate),
      statusLabel: r.status, responsibleName: r.resp, reason: r.reason ?? null,
    };
    await prisma.plan.upsert({
      where: { externalRef: `plan:${r.n}` },
      update: planData,
      create: { externalRef: `plan:${r.n}`, ...planData },
    });
    if (r.fact > 0) {
      const date = parseDotDate(r.fdate) ?? parseDotDate(r.pdate) ?? PERIOD;
      const data = {
        date, type: 'out' as OperationType, isPlan: false,
        amountDirams: dirams(r.fact), currencyCode: 'TJS',
        rate: new Prisma.Decimal(1), rateDate: date, amountTjsDirams: dirams(r.fact),
        status: 'confirmed' as const, comment: r.cat,
        articleId: artId, projectId: projId,
        counterpartyId: await counterpartyId(r.payee),
      };
      await prisma.operation.upsert({ where: { externalRef: r.n }, update: data, create: { externalRef: r.n, ...data } });
    }
  }
}

/** Входящие остатки проектов: суммы карточек проектов из фикстур больше
 *  сумм октябрьских операций (это накопления за всё время проекта).
 *  Разница заводится «входящим остатком» — операциями/планами с ключами
 *  base:<проект>:*, чтобы суммы проектов считались из БД и совпадали
 *  с примером (решение зафиксировано в docs/CABINET_DIFF.md). */
async function seedProjectBaselines() {
  const canon = (raw: string) => (raw in PROJECT_ALIASES ? PROJECT_ALIASES[raw] : raw);
  const otherIncome = await articleId('Прочие доходы', 'income');
  const otherExpense = await articleId('Прочие расходы', 'expense');

  for (const p of PROJECTS) {
    const incRows = INCOMES.filter((r) => canon(r.proj) === p.name);
    const expRows = EXPENSES.filter((r) => canon(r.proj) === p.name);
    const seeded = {
      inF: incRows.reduce((s, r) => s + r.fact, 0),
      inP: incRows.reduce((s, r) => s + r.plan, 0),
      outF: expRows.reduce((s, r) => s + r.fact, 0),
      outP: expRows.reduce((s, r) => s + r.plan, 0),
    };
    const projId = await projectId(p.name);
    if (!projId) continue;
    const baseDate = p.s ? new Date(p.s + 'T00:00:00Z') : utcDate(2026, 9, 30);
    const comment = 'Входящий остаток на 01.10.2026 (данные примера)';

    const baseOp = async (suffix: string, type: OperationType, artId: number, amount: number) => {
      if (amount <= 0) return;
      const data = {
        date: baseDate, type, isPlan: false,
        amountDirams: dirams(amount), currencyCode: 'TJS',
        rate: new Prisma.Decimal(1), rateDate: baseDate, amountTjsDirams: dirams(amount),
        status: 'confirmed' as const, comment,
        articleId: artId, projectId: projId,
      };
      await prisma.operation.upsert({
        where: { externalRef: `base:${p.id}:${suffix}` },
        update: data,
        create: { externalRef: `base:${p.id}:${suffix}`, ...data },
      });
    };
    const basePlan = async (suffix: string, artId: number, amount: number) => {
      if (amount <= 0) return;
      const data = { articleId: artId, projectId: projId, period: PERIOD, amountDirams: dirams(amount) };
      await prisma.plan.upsert({
        where: { externalRef: `base:${p.id}:${suffix}` },
        update: data,
        create: { externalRef: `base:${p.id}:${suffix}`, ...data },
      });
    };

    await baseOp('inF', 'in', otherIncome, p.inF - seeded.inF);
    await baseOp('outF', 'out', otherExpense, p.outF - seeded.outF);
    await basePlan('inP', otherIncome, p.inP - seeded.inP);
    await basePlan('outP', otherExpense, p.outP - seeded.outP);
  }
}

/** Журнал операций (экран «Операции»). */
async function seedOperationsJournal() {
  for (let i = 0; i < OPS.length; i++) {
    const [dateStr, account, dir, party, article, sub, project, amount] = OPS[i];
    const date = parseRuDate(dateStr);
    const type: OperationType = dir === 'in' ? 'in' : 'out';
    const data = {
      date, type, isPlan: false,
      amountDirams: dirams(amount), currencyCode: 'TJS',
      rate: new Prisma.Decimal(1), rateDate: date, amountTjsDirams: dirams(amount),
      status: 'confirmed' as const, comment: sub,
      accountId: await accountId(account),
      articleId: await articleId(article, dir === 'in' ? 'income' : 'expense'),
      projectId: await projectId(project),
      counterpartyId: await counterpartyId(party),
    };
    await prisma.operation.upsert({ where: { externalRef: `ops:${i}` }, update: data, create: { externalRef: `ops:${i}`, ...data } });
  }
}

/** Заявки кабинета бухгалтера. */
async function seedRequests() {
  const accountant = await prisma.user.findUniqueOrThrow({ where: { email: 'accountant@it-hona.tj' } });
  const director = await prisma.user.findUniqueOrThrow({ where: { email: 'director@it-hona.tj' } });

  const upsertRequest = async (req: {
    number: string; kind: 'payment' | 'trip' | 'auto'; status: ReqStatus; project: string;
    name: string; amount?: number; currency?: string; km?: number; category?: string;
    counterpartyName?: string; date: string;
    attachments: Array<{ kind: string; fileName: string }>;
  }) => {
    const status = REQ_STATUS[req.status];
    const decided = status === 'approved' || status === 'rejected';
    const requestDate = parseDotDate(req.date)!;
    const data = {
      kind: req.kind, status,
      authorId: accountant.id,
      projectId: await projectId(req.project),
      name: req.name,
      amountDirams: req.amount != null ? dirams(req.amount) : null,
      currencyCode: req.currency ?? null,
      km: req.km ?? null,
      category: req.category ?? null,
      counterpartyName: req.counterpartyName && req.counterpartyName !== '—' ? req.counterpartyName : null,
      requestDate,
      decisionById: decided ? director.id : null,
      decisionAt: decided ? requestDate : null,
    };
    const row = await prisma.request.upsert({
      where: { number: req.number },
      // deletedAt: null — повторный seed восстанавливает демо-заявку,
      // удалённую во время проверок
      update: { ...data, deletedAt: null },
      create: { number: req.number, ...data },
    });
    for (const a of req.attachments) {
      await prisma.attachment.upsert({
        where: { requestId_fileName: { requestId: row.id, fileName: a.fileName } },
        update: { kind: a.kind },
        create: { requestId: row.id, kind: a.kind, fileName: a.fileName },
      });
    }
  };

  for (const r of PAY) {
    await upsertRequest({
      number: r.id, kind: 'payment', status: r.status, project: r.project, name: r.name,
      amount: r.amount, currency: r.currency, date: r.date,
      attachments: r.doc ? [{ kind: 'doc', fileName: r.doc }] : [],
    });
  }
  for (const r of TRIPS) {
    await upsertRequest({
      number: r.id, kind: 'trip', status: r.status, project: r.project, name: r.goal,
      km: r.km, counterpartyName: r.contragent, date: r.date,
      attachments: r.photo ? [{ kind: 'photo', fileName: r.photo }] : [],
    });
  }
  for (const r of CARS) {
    await upsertRequest({
      number: r.id, kind: 'auto', status: r.status, project: r.project, name: r.category,
      amount: r.amount, currency: r.currency, category: r.category, date: r.date,
      attachments: r.receipt ? [{ kind: 'receipt', fileName: r.receipt }] : [],
    });
  }
}

/* ── Запуск ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log('[seed] Роли и пользователи…');
  await seedRolesAndUsers();
  console.log('[seed] Валюты и курсы…');
  await seedCurrencies();
  console.log('[seed] Настройки…');
  await seedSettings();
  console.log('[seed] Справочники…');
  await seedDictionaries();
  console.log('[seed] Учётные статьи…');
  await seedArticles();
  console.log('[seed] Проекты…');
  await seedProjects();
  console.log('[seed] План-факт (планы и фактические операции)…');
  await seedPlanFact();
  console.log('[seed] Входящие остатки проектов…');
  await seedProjectBaselines();
  console.log('[seed] Журнал операций…');
  await seedOperationsJournal();
  console.log('[seed] Заявки кабинета…');
  await seedRequests();

  const [projects, articles, counterparties, accounts, operations, plans, requests, attachments, users] =
    await Promise.all([
      prisma.project.count(), prisma.article.count(), prisma.counterparty.count(),
      prisma.account.count(), prisma.operation.count(), prisma.plan.count(),
      prisma.request.count(), prisma.attachment.count(), prisma.user.count(),
    ]);
  console.log('[seed] Готово:', { projects, articles, counterparties, accounts, operations, plans, requests, attachments, users });
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
