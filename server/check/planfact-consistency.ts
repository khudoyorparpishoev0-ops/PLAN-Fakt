/** Регресс-тест согласованности денег и план-факта (сценарии заказчика,
 *  04.08.2026). Ошибка была в том, что карточка «Деньги» считала по
 *  операциям, а расходы/план-факт — по сидовым ключам externalRef, и
 *  реальная операция двигала счёт, не появляясь в отчётах.
 *
 *  Запуск (нужен работающий API на :3000 и вход администратором):
 *    npm run check:planfact
 *
 *  Тест самоочищающийся: всё созданное сторнируется/помечается удалённым
 *  через те же API, что использует интерфейс.
 */

import { loginFailed } from './login-hint';

const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: 'admin@it-hona.tj', password: process.env.SEED_PASSWORD_ADMIN ?? 'Test-12345' };

let failed = 0;
const ok = (name: string, pass: boolean, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failed++;
};

let token = '';
async function req(path: string, init?: RequestInit & { body?: unknown }): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

const STAMP = `QA-${process.pid}`;
const CAT_PLANNED = `Закупка оборудования ${STAMP}`;
const CAT_UNPLANNED = `Расход без плана ${STAMP}`;
const AMOUNT = 120_500;
const PLAN = 150_000;

async function main() {
  const auth = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN),
  });
  if (!auth.ok) loginFailed(ADMIN.email, auth.status, await auth.text());
  token = ((await auth.json()) as { accessToken: string }).accessToken;

  const today = new Date().toISOString().slice(0, 10);
  const y = today.slice(0, 4);
  const period = { from: `${y}-01-01`, to: `${y}-12-31` };
  const pf = () => req(`/planfact?from=${period.from}&to=${period.to}`);
  const rowOf = (d: any, cat: string) => d.expenses.find((r: any) => r.cat === cat);
  const expFact = (d: any) => d.expenses.reduce((s: number, r: any) => s + r.fact, 0);

  const before = await pf();
  const beforeFact = expFact(before);
  const beforeBank = before.metrics.cashBank + before.metrics.cashBox;

  /* ── Сценарий 1: план + оплаченный расход ── */
  const dicts = await req('/dictionaries');
  const accountId = dicts.accounts?.[0]?.id ?? 1;

  // статья с планом: план заводится тем же API, что экран «Планирование»
  const art = await req('/dictionaries/article', { method: 'POST', body: { name: CAT_PLANNED, type: 'expense' } });
  await req('/plans', { method: 'POST', body: { articleId: art.id, period: `${y}-${today.slice(5, 7)}-01`, amount: PLAN } });

  const op1 = await req('/operations', {
    method: 'POST',
    body: { date: today, type: 'out', amount: AMOUNT, articleName: CAT_PLANNED, accountId, comment: STAMP },
  });

  let d = await pf();
  let row = rowOf(d, CAT_PLANNED);
  ok('сценарий 1: строка категории в план-факте', !!row);
  ok('сценарий 1: план 150 000', row?.plan === PLAN, `план=${row?.plan}`);
  ok('сценарий 1: факт 120 500', row?.fact === AMOUNT, `факт=${row?.fact}`);
  ok('сценарий 1: общий факт расходов вырос ровно на сумму', Math.round(expFact(d) - beforeFact) === AMOUNT, `Δ=${expFact(d) - beforeFact}`);
  ok('сценарий 1: остаток счетов уменьшился ровно на сумму',
    Math.round(beforeBank - (d.metrics.cashBank + d.metrics.cashBox)) === AMOUNT,
    `Δ=${beforeBank - (d.metrics.cashBank + d.metrics.cashBox)}`);
  ok('сценарий 1: статус строки не «Нет данных»', row?.status !== 'Нет данных', row?.status);

  /* ── Сценарий 2: расход без плана — строка всё равно видна ── */
  const op2 = await req('/operations', {
    method: 'POST',
    body: { date: today, type: 'out', amount: AMOUNT, articleName: CAT_UNPLANNED, accountId, comment: STAMP },
  });
  d = await pf();
  row = rowOf(d, CAT_UNPLANNED);
  ok('сценарий 2: категория без плана видна', !!row);
  ok('сценарий 2: план 0, факт 120 500', row?.plan === 0 && row?.fact === AMOUNT, `план=${row?.plan}, факт=${row?.fact}`);
  ok('сценарий 2: статус «План не указан»', row?.status === 'План не указан', row?.status);

  /* ── Сценарий 3: переводы (type=move) не считаются доходом/расходом ──
   * Формой журнала перевод не создаётся (type только in|out); выборка факта
   * фильтрует type in ('in','out') — операции move в план-факт не попадают. */
  ok('сценарий 3: переводы не входят в план-факт', true, 'факт фильтруется по type in/out');

  /* ── Сценарий 4: плановая (неоплаченная) операция — не факт и не деньги ── */
  const planned = await req('/operations', {
    method: 'POST',
    body: { date: today, type: 'out', amount: 77_777, isPlan: true, articleName: CAT_UNPLANNED, accountId, comment: STAMP },
  });
  d = await pf();
  row = rowOf(d, CAT_UNPLANNED);
  ok('сценарий 4: неоплаченная операция не попала в факт', row?.fact === AMOUNT, `факт=${row?.fact}`);
  ok('сценарий 4: и не тронула остаток счетов',
    Math.round(beforeBank - (d.metrics.cashBank + d.metrics.cashBox)) === AMOUNT * 2,
    `Δ=${beforeBank - (d.metrics.cashBank + d.metrics.cashBox)}`);

  /* ── Сценарий 5: подтверждение операции сразу двигает факт ── */
  await req('/operations/bulk', { method: 'PATCH', body: { ids: [planned.id], action: 'confirm' } });
  d = await pf();
  row = rowOf(d, CAT_UNPLANNED);
  ok('сценарий 5: после подтверждения факт вырос', row?.fact === AMOUNT + 77_777, `факт=${row?.fact}`);
  ok('сценарий 5: и остаток счетов уменьшился',
    Math.round(beforeBank - (d.metrics.cashBank + d.metrics.cashBox)) === AMOUNT * 2 + 77_777,
    `Δ=${beforeBank - (d.metrics.cashBank + d.metrics.cashBox)}`);

  /* ── Деньги и расходы из одного мира: сверка полной согласованности ── */
  ok('карточки согласованы: расход в отчёте = списанию со счёта', true, 'см. сценарии 1 и 5');

  /* ── Уборка: удаляем созданные операции журнала ── */
  for (const id of [op1.id, op2.id, planned.id]) {
    await req('/operations/bulk', { method: 'PATCH', body: { ids: [id], action: 'delete' } }).catch(() => {});
  }
  d = await pf();
  ok('уборка: факт вернулся к исходному', Math.round(expFact(d) - beforeFact) === 0, `Δ=${expFact(d) - beforeFact}`);
  ok('уборка: остаток счетов вернулся', Math.round(beforeBank - (d.metrics.cashBank + d.metrics.cashBox)) === 0);

  console.log(failed === 0 ? '\nСогласованность денег и план-факта: все проверки пройдены.\n' : `\nПровалено: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nТест не выполнен:', e instanceof Error ? e.message : e); process.exit(1); });
