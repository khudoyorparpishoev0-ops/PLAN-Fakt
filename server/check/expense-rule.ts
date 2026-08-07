/** Регресс-проверка правила «расход становится фактом при оплате поставщику».
 *
 *  Заказчик закрыл блокирующую развилку пакета в пользу этого варианта.
 *  Правило легко сломать случайно: модуль поставок живой и продолжает
 *  создавать складские движения — достаточно один раз добавить туда
 *  создание операции, и факт в План-Факте начнёт расти по дате приёмки,
 *  то есть разойдётся с банковской выпиской.
 *
 *  Что проверяем на живом API:
 *    1. поставка по сделке НЕ меняет факт по проекту, но приходует товар;
 *    2. выплата, привязанная к сделке, увеличивает факт ровно на свою сумму.
 *
 *  Запуск (нужен поднятый сервер и заполненная база):
 *    API=http://localhost:3000/api ADMIN_PASSWORD=… npm run check:expense
 *
 *  Проверка создаёт свои данные и убирает их за собой. */

const API = process.env.API ?? 'http://localhost:3000/api';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@it-hona.tj';
// В контейнере пароли приходят из /opt/app/.env как SEED_PASSWORD_*,
// поэтому все пять проверок запускаются одной и той же командой
const PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.SEED_PASSWORD_ADMIN ?? '';

let token = '';
let failures = 0;

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return data;
}

function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name} — ${detail}`);
  if (!ok) failures++;
}

/** Факт расхода по проекту, в сомони. */
async function expenseFact(projectId: number): Promise<number> {
  const summary = await call('GET', `/projects/${projectId}/summary`);
  return summary.rows
    .filter((r: { type: string }) => r.type === 'expense')
    .reduce((sum: number, r: { fact: number }) => sum + r.fact, 0);
}

/** Остаток товара на складе, в единицах. */
async function stockQty(goodId: number): Promise<number> {
  const stock = await call('GET', '/stock');
  const rows = Array.isArray(stock) ? stock : (stock.rows ?? []);
  const row = rows.find((r: { id: number }) => r.id === goodId);
  return row ? Number(row.qty) : 0;
}

async function main() {
  if (!PASSWORD) throw new Error('Задайте ADMIN_PASSWORD или SEED_PASSWORD_ADMIN — пароль администратора');

  token = (await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;

  const projects = await call('GET', '/projects');
  const projectId: number = (projects.rows ?? projects)[0].id;
  const dict = await call('GET', '/dictionaries');
  const goodId: number = (dict.goods ?? [])[0]?.id;
  if (!goodId) throw new Error('В справочнике нет товаров — проверка требует заполненной базы');

  const today = new Date().toISOString().slice(0, 10);
  const QTY = 3;
  const PRICE = 500; // сомони за единицу
  const PAYMENT = 1500; // сомони

  const factStart = await expenseFact(projectId);
  const qtyStart = await stockQty(goodId);
  console.log(`\nПроект ${projectId}: факт расхода ${factStart} TJS, остаток товара ${goodId}: ${qtyStart}\n`);

  const deal = await call('POST', '/deals', {
    title: 'Проверка правила расхода',
    date: today,
    projectId,
    positions: [{ name: 'Позиция проверки', goodId, qty: QTY, price: PRICE }],
  });

  /* ── 1. Поставка: склад растёт, факт стоит ─────────────────────────────── */
  const delivery = await call('POST', `/deals/${deal.id}/deliveries`, {
    date: today,
    positions: [{ name: 'Позиция проверки', goodId, qty: QTY, price: PRICE }],
  });

  const factAfterDelivery = await expenseFact(projectId);
  const qtyAfterDelivery = await stockQty(goodId);

  check(
    'поставка не создаёт факт расхода',
    factAfterDelivery === factStart,
    `факт ${factStart} → ${factAfterDelivery} TJS (ожидалось без изменений)`,
  );
  check(
    'поставка приходует товар на склад',
    qtyAfterDelivery === qtyStart + QTY,
    `остаток ${qtyStart} → ${qtyAfterDelivery} (ожидалось ${qtyStart + QTY})`,
  );

  /* ── 2. Выплата: факт растёт ровно на её сумму ─────────────────────────── */
  const op = await call('POST', '/operations', {
    date: today,
    type: 'out',
    amount: PAYMENT,
    articleName: 'Проверка правила расхода',
    projectId,
  });
  await call('POST', `/deals/${deal.id}/payments`, { operationIds: [op.id] });

  const factAfterPayment = await expenseFact(projectId);
  check(
    'выплата увеличивает факт на свою сумму',
    factAfterPayment === factAfterDelivery + PAYMENT,
    `факт ${factAfterDelivery} → ${factAfterPayment} TJS (ожидалось ${factAfterDelivery + PAYMENT})`,
  );

  /* ── Уборка ───────────────────────────────────────────────────────────── */
  await call('DELETE', `/deals/${deal.id}/deliveries/${delivery.id}`);
  await call('PATCH', '/operations/bulk', { ids: [op.id], action: 'delete' });
  await call('DELETE', `/deals/${deal.id}`);

  const factEnd = await expenseFact(projectId);
  const qtyEnd = await stockQty(goodId);
  check('уборка вернула факт к исходному', factEnd === factStart, `${factEnd} = ${factStart} TJS`);
  check('уборка вернула остаток к исходному', qtyEnd === qtyStart, `${qtyEnd} = ${qtyStart}`);

  console.log(failures === 0 ? '\nПравило расхода соблюдается.\n' : `\nПровалено проверок: ${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nПроверка не выполнена:', e instanceof Error ? e.message : e, '\n');
  process.exit(2);
});
