/** Очистка демонстрационных данных перед боевым запуском.
 *
 *  Сид наполняет базу примерами, чтобы экраны не были пустыми на показе.
 *  Перед реальной работой их надо убрать — иначе первый же отчёт смешает
 *  выдуманные 1,2 млн сомони с настоящими цифрами.
 *
 *  ── Принципы, на которых написан скрипт ────────────────────────────────
 *
 *  1. Удаляется ТОЛЬКО то, что можно доказать. Демо-строки опознаются по
 *     тем же ключам, которыми их создаёт сид, и списки берутся из тех же
 *     фикстур — скрипт не может разойтись с сидом при правке фикстур.
 *
 *  2. Удаление мягкое (deletedAt). Приложение везде фильтрует deletedAt,
 *     поэтому данные исчезают из интерфейса, но остаются в базе — ошибку
 *     можно отменить, не разворачивая копию.
 *
 *  3. Справочники, пользователи и настройки не трогаются. Статьи учёта,
 *     счета, контрагенты и номенклатура — это структура, на которой стоят
 *     ссылки; их удаление сломало бы связи. Что с ними делать, решает
 *     человек — скрипт только показывает, сколько их.
 *
 *  4. Без --yes ничего не удаляется: печатается план и всё.
 *
 *  ── Как отличается демо от настоящего ──────────────────────────────────
 *
 *  externalRef — служебное поле, пользователь его не заполняет. Приложение
 *  пишет туда ровно одно значение: `req:<номер заявки>` при одобрении
 *  (requests.service.ts), плюс `:storno` при сторнировании. Всё остальное
 *  (`ops:`, `base:`, `deal:`, «Д-1041», «Р-2107») ставит только сид.
 *
 *  Поэтому `req:` по префиксу брать НЕЛЬЗЯ: под него попадут плановые
 *  операции настоящих одобренных заявок. Демо-заявки берутся поимённо из
 *  фикстур, и `req:`-операции — только по этим номерам.
 *
 *  Планы приложение создаёт без externalRef (stage2.service.ts), так что
 *  `plan:` и `base:` у планов — целиком сидовые.
 *
 *  ── Запуск ────────────────────────────────────────────────────────────
 *    npm run clean:demo            # показать, что будет удалено
 *    npm run clean:demo -- --yes   # удалить
 *
 *  Перед удалением снимите копию: sudo /opt/app/backup-db.sh
 */

import { PrismaClient } from '@prisma/client';

import { CARS, PAY, TRIPS } from '../../src/data/cabinet';
import { DEMO_CLEANED_KEY } from './demo-flag';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--yes');
const now = new Date();

/** Номера демо-заявок — из тех же фикстур, что читает сид.
 *  Настоящие заявки продолжают ту же нумерацию («З-125»), поэтому список
 *  именно поимённый, а не по префиксу номера. */
const DEMO_REQUESTS = [...PAY, ...TRIPS, ...CARS].map((r) => r.id);

/** Плановые операции демо-заявок: `req:З-118` и сторно `req:З-118:storno`. */
const DEMO_REQUEST_REFS = DEMO_REQUESTS.flatMap((n) => [`req:${n}`, `req:${n}:storno`]);

/** Префиксы externalRef, которые ставит только сид. */
const SEED_REF_PREFIXES = ['ops:', 'base:', 'deal:', 'Д-', 'Р-'];

/** Демо-сделка. Остальные СД-* сид не создаёт. */
const DEMO_DEAL = 'СД-001';

/** Демо-задачи: точные заголовки из сида (seed.ts, блок «Задачи»). */
const DEMO_TASKS = [
  'Собрать закрывающие документы по сделке СД-001',
  'Согласовать бюджет ГЭС Помир-1 на ноябрь',
  'Проверить остатки на складе перед закупкой',
];

/** Складские движения входящих остатков, заведённые сидом. */
const DEMO_MOVE_COMMENT = 'Входящий остаток склада';

/** Входящие остатки счетов — тоже демо-деньги, хотя лежат на справочнике.
 *  Сид достаёт их из подписи счёта («Расчётный счёт · остаток 512 600 смн»),
 *  так что подпись и служит доказательством: остаток поставлен сидом, а не
 *  человеком. Сам счёт остаётся — на него ссылаются операции; обнуляется
 *  только сумма, иначе карточка «Деньги» покажет 596 466 сомони, которых нет. */
const openingWhere = {
  deletedAt: null,
  openingDirams: { gt: BigInt(0) },
  note: { contains: 'остаток' },
};

const line = (name: string, n: number, note = '') =>
  console.log(`  ${String(n).padStart(5)}  ${name}${note ? ` · ${note}` : ''}`);

/** Дирамы → «512 600,00» (в выводе деньги должны читаться как деньги). */
const somoni = (d: bigint) =>
  (Number(d) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  console.log(APPLY ? '\nУДАЛЕНИЕ демо-данных\n' : '\nПЛАН очистки (ничего не удаляется, добавьте --yes)\n');

  const deal = await prisma.deal.findFirst({ where: { number: DEMO_DEAL } });

  /* ── Что подпадает под удаление ──────────────────────────────────────── */
  const opWhere = {
    deletedAt: null,
    OR: [
      ...SEED_REF_PREFIXES.map((p) => ({ externalRef: { startsWith: p } })),
      { externalRef: { in: DEMO_REQUEST_REFS } },
      ...(deal ? [{ dealId: deal.id }] : []),
    ],
  };
  const planWhere = {
    deletedAt: null,
    OR: [
      { externalRef: { startsWith: 'plan:' } },
      { externalRef: { startsWith: 'base:' } },
    ],
  };
  const reqWhere = { deletedAt: null, number: { in: DEMO_REQUESTS } };
  const taskWhere = { deletedAt: null, title: { in: DEMO_TASKS } };
  const moveWhere = {
    deletedAt: null,
    OR: [{ comment: DEMO_MOVE_COMMENT }, ...(deal ? [{ dealId: deal.id }] : [])],
  };

  const [ops, plans, reqs, tasks, moves, deliveries, openings] = await Promise.all([
    prisma.operation.count({ where: opWhere }),
    prisma.plan.count({ where: planWhere }),
    prisma.request.count({ where: reqWhere }),
    prisma.task.count({ where: taskWhere }),
    prisma.stockMove.count({ where: moveWhere }),
    deal ? prisma.delivery.count({ where: { deletedAt: null, dealId: deal.id } }) : Promise.resolve(0),
    prisma.account.findMany({ where: openingWhere, select: { name: true, openingDirams: true } }),
  ]);

  console.log('Будет помечено удалённым:');
  line('операций', ops, 'журнал и план-факт');
  line('плановых строк', plans);
  line('заявок', reqs, `из ${DEMO_REQUESTS.length} демо-номеров`);
  line('сделок', deal ? 1 : 0, deal ? DEMO_DEAL : 'демо-сделки нет');
  line('поставок', deliveries);
  line('движений склада', moves);
  line('задач', tasks);

  if (openings.length) {
    const sum = openings.reduce((a, b) => a + b.openingDirams, BigInt(0));
    console.log('\nБудут обнулены входящие остатки счетов (сами счета остаются):');
    for (const a of openings) console.log(`  ${somoni(a.openingDirams)}  ${a.name}`);
    console.log(`  Иначе карточка «Деньги» покажет ${somoni(sum)} сомони, которых нет.`);
  }

  /* ── Что остаётся и почему ───────────────────────────────────────────── */
  // Остаток считаем вычитанием, а не отрицанием условия: NOT (ref LIKE 'ops:%')
  // в SQL ложно и для NULL, а именно NULL стоит у операций, заведённых людьми —
  // отрицание выкинуло бы из подсчёта как раз то, что мы хотим показать.
  const [users, articles, parties, accounts, goods, projects, allOps, allReqs, allPlans] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.article.count({ where: { deletedAt: null } }),
    prisma.counterparty.count({ where: { deletedAt: null } }),
    prisma.account.count({ where: { deletedAt: null } }),
    prisma.good.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.operation.count({ where: { deletedAt: null } }),
    prisma.request.count({ where: { deletedAt: null } }),
    prisma.plan.count({ where: { deletedAt: null } }),
  ]);

  console.log('\nОстаётся нетронутым:');
  line('операций', allOps - ops, 'заведены в системе, не сидом');
  line('плановых строк', allPlans - plans);
  line('заявок', allReqs - reqs, 'созданы пользователями');
  line('пользователей', users, 'учётные записи и роли');
  line('статей учёта', articles);
  line('контрагентов', parties);
  line('счетов', accounts);
  line('номенклатуры', goods);
  line('проектов', projects, 'демо-проекты удалите вручную, если не нужны');

  console.log(
    '\nСправочники и проекты не трогаются намеренно: на них стоят ссылки,\n'
    + 'и часть из них пригодится в работе. Лишнее уберите через интерфейс —\n'
    + 'занятые записи система переведёт в архив, а не удалит.',
  );

  if (!APPLY) {
    console.log('\nЭто был план. Чтобы удалить: npm run clean:demo -- --yes');
    console.log('Перед удалением снимите копию: sudo /opt/app/backup-db.sh\n');
    await prisma.$disconnect();
    return;
  }

  /* ── Удаление ────────────────────────────────────────────────────────── */
  // Одной транзакцией: половина удалённой демо-сделки хуже целой.
  const res = await prisma.$transaction(async (tx) => {
    const o = await tx.operation.updateMany({ where: opWhere, data: { deletedAt: now } });
    const p = await tx.plan.updateMany({ where: planWhere, data: { deletedAt: now } });
    // Вложения демо-заявок уходят вместе с заявками
    const ra = await tx.attachment.updateMany({
      where: { deletedAt: null, request: { number: { in: DEMO_REQUESTS } } }, data: { deletedAt: now },
    });
    const r = await tx.request.updateMany({ where: reqWhere, data: { deletedAt: now } });
    const t = await tx.task.updateMany({ where: taskWhere, data: { deletedAt: now } });
    const m = await tx.stockMove.updateMany({ where: moveWhere, data: { deletedAt: now } });
    let d = 0, dp = 0, pos = 0, att = 0;
    if (deal) {
      dp = (await tx.deliveryPosition.updateMany({
        where: { deletedAt: null, delivery: { dealId: deal.id } }, data: { deletedAt: now },
      })).count;
      d = (await tx.delivery.updateMany({ where: { deletedAt: null, dealId: deal.id }, data: { deletedAt: now } })).count;
      pos = (await tx.dealPosition.updateMany({ where: { deletedAt: null, dealId: deal.id }, data: { deletedAt: now } })).count;
      att = (await tx.attachment.updateMany({ where: { deletedAt: null, dealId: deal.id }, data: { deletedAt: now } })).count;
      await tx.deal.update({ where: { id: deal.id }, data: { deletedAt: now } });
    }
    const acc = await tx.account.updateMany({ where: openingWhere, data: { openingDirams: BigInt(0) } });
    // Отметка в той же транзакции: иначе она может разойтись с фактом удаления,
    // а по ней сид решает, работать ему или молча выйти.
    const stamp = now.toISOString().slice(0, 10);
    await tx.setting.upsert({
      where: { key: DEMO_CLEANED_KEY },
      update: { value: stamp },
      create: { key: DEMO_CLEANED_KEY, value: stamp },
    });
    return { o: o.count, p: p.count, r: r.count, t: t.count, m: m.count, d, dp, pos, att: att + ra.count, acc: acc.count };
  });

  console.log('\nУдалено:');
  line('операций', res.o);
  line('плановых строк', res.p);
  line('заявок', res.r);
  line('позиций сделки', res.pos);
  line('поставок', res.d, `позиций: ${res.dp}`);
  line('движений склада', res.m);
  line('задач', res.t);
  line('вложений', res.att);
  if (res.acc) line('счетов', res.acc, 'входящий остаток обнулён');
  console.log('\nУдаление мягкое: строки остались в базе с отметкой deleted_at.');
  console.log('Если убрали лишнее — восстановите из копии или снимите отметку вручную.');
  console.log('\nБаза помечена как боевая: сид при следующем деплое пропустит наполнение');
  console.log('и не вернёт удалённое. Если демо-данные всё же нужны: npm run seed -- --force\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\nОчистка не выполнена:', e instanceof Error ? e.message : e, '\n');
  await prisma.$disconnect();
  process.exit(1);
});
