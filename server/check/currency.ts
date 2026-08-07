/** Регресс-тест мультивалютности (решение заказчика 06.08.2026:
 *  «валюта — все валюты мира»).
 *
 *  Проверяет то, что легко сломать молча: справочник, отказ от выдуманного
 *  кода, отказ от операции без курса, пересчёт в сомони по курсу на дату
 *  операции и попадание в отчёты именно сомони, а не цифры из формы.
 *
 *  Запуск (нужен работающий API на :3000):
 *    npm run check:currency
 *
 *  Уборка за собой — теми же API, что и интерфейс: операции помечаются
 *  удалёнными, заявки отклоняются директором. Совсем удалить отправленную
 *  заявку нельзя (ТЗ, п. 8: удаляется только черновик), поэтому их номера
 *  печатаются в конце — чтобы след проверки был виден, а не потерян.
 */

import { loginFailed } from './login-hint';

const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: 'admin@it-hona.tj', password: process.env.SEED_PASSWORD_ADMIN ?? 'Test-12345' };
const ACC = { email: 'accountant@it-hona.tj', password: process.env.SEED_PASSWORD_ACCOUNTANT ?? 'Test-12345' };
const DIR = { email: 'director@it-hona.tj', password: process.env.SEED_PASSWORD_DIRECTOR ?? 'Test-12345' };

let failed = 0;
const ok = (name: string, pass: boolean, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failed++;
};

async function call(
  path: string,
  init: (RequestInit & { body?: unknown; token?: string }) | undefined,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const login = async (who: { email: string; password: string }): Promise<string> => {
  const r = await call('/auth/login', { method: 'POST', body: who });
  if (r.status !== 200) loginFailed(who.email, r.status, JSON.stringify(r.json));
  return r.json.accessToken as string;
};

const STAMP = `QA-валюта-${process.pid}`;
/** Курс выбран заведомо не «единица», иначе ошибка пересчёта не видна. */
const RATE = 11.4;
const AMOUNT_USD = 1000;
const TODAY = new Date().toISOString().slice(0, 10);
/** Дата курса — вчера: операция должна брать последний курс НЕ ПОЗЖЕ своей даты. */
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
/** Валюта, которой курс заведомо не задан. */
const NO_RATE = 'KRW';

async function main() {
  const admin = await login(ADMIN);
  const accountant = await login(ACC);
  const created: number[] = [];
  const createdReqs: number[] = [];

  /* ── 1. Справочник ── */
  const list = (await call('/currencies', { token: admin })).json as {
    code: string; name: string; digits: number; rate: number | null; used: boolean;
  }[];
  ok('справочник отдаёт все валюты мира', list.length >= 150, `валют: ${list.length}`);
  const jpy = list.find((c) => c.code === 'JPY');
  const kwd = list.find((c) => c.code === 'KWD');
  ok('иена без копеек (digits 0)', jpy?.digits === 0, String(jpy?.digits));
  ok('кувейтский динар с тремя знаками', kwd?.digits === 3, String(kwd?.digits));
  ok('названия по-русски', /[а-яА-Я]/.test(list.find((c) => c.code === 'USD')?.name ?? ''),
    list.find((c) => c.code === 'USD')?.name ?? '—');
  ok('базовая валюта первой группой', list[0]?.used === true, `${list[0]?.code} · used=${list[0]?.used}`);

  /* ── 2. Бухгалтеру справочник доступен (без него нечего выбрать в заявке) ── */
  const accList = await call('/currencies', { token: accountant });
  ok('бухгалтер видит справочник валют', accList.status === 200, `HTTP ${accList.status}`);

  /* ── 3. Выдуманный код отклоняется ── */
  const fake = await call('/operations', {
    method: 'POST', token: admin,
    body: { date: TODAY, type: 'out', amount: 10, currency: 'XYZ', articleName: `Проверка ${STAMP}` },
  });
  ok('несуществующий код валюты → 422', fake.status === 422, `HTTP ${fake.status}`);

  /* ── 4. Операция в валюте без курса не проходит: молча взять «1» нельзя.
         Вона выбрана намеренно — курса ей в системе никто не задавал. ── */
  const noRate = await call('/operations', {
    method: 'POST', token: admin,
    body: { date: TODAY, type: 'out', amount: 100000, currency: NO_RATE, articleName: `Проверка ${STAMP}` },
  });
  if (noRate.json?.id) created.push(noRate.json.id); // на случай, если курс всё же есть
  ok('операция в валюте без курса → 422 no_exchange_rate',
    noRate.status === 422 && noRate.json?.error?.code === 'no_exchange_rate',
    `HTTP ${noRate.status} ${noRate.json?.error?.code ?? ''}`);

  /* ── 5. Курс задан вчера — операция сегодня берёт его ── */
  const setRate = await call('/rates', { method: 'POST', token: admin, body: { currency: 'USD', date: YESTERDAY, rate: RATE } });
  ok('курс сохраняется', setRate.status === 201 || setRate.status === 200, `HTTP ${setRate.status}`);

  const op = await call('/operations', {
    method: 'POST', token: admin,
    body: { date: TODAY, type: 'out', amount: AMOUNT_USD, currency: 'USD', articleName: `Проверка ${STAMP}` },
  });
  ok('операция в USD создаётся', op.status === 201 || op.status === 200, `HTTP ${op.status}`);
  if (op.json?.id) created.push(op.json.id);
  ok('в журнал попала сумма в сомони', op.json?.amount === AMOUNT_USD * RATE,
    `${op.json?.amount} вместо ${AMOUNT_USD * RATE}`);
  ok('исходная сумма и валюта сохранены',
    op.json?.amountOriginal === AMOUNT_USD && op.json?.currency === 'USD',
    `${op.json?.amountOriginal} ${op.json?.currency}`);

  /* ── 6. Курс из формы важнее курса из справочника ── */
  const own = await call('/operations', {
    method: 'POST', token: admin,
    body: { date: TODAY, type: 'out', amount: 100, currency: 'USD', rate: 20, articleName: `Проверка ${STAMP}` },
  });
  if (own.json?.id) created.push(own.json.id);
  ok('курс, вписанный в форму, применяется', own.json?.amount === 2000, String(own.json?.amount));

  /* ── 7. Заявка в валюте: сумма в сомони считается для итогов ── */
  const req = await call('/requests', {
    method: 'POST', token: accountant,
    body: { kind: 'payment', name: `${STAMP} оплата в долларах`, amount: 500, currency: 'USD' },
  });
  ok('заявка в USD создаётся', req.status === 201 || req.status === 200, `HTTP ${req.status}`);
  if (req.json?.id) createdReqs.push(req.json.id);
  ok('заявка отдаёт сумму в сомони отдельным полем', req.json?.amountTjs === 500 * RATE,
    `amountTjs=${req.json?.amountTjs}, amount=${req.json?.amount} ${req.json?.currency}`);

  /* ── 8. Заявка в валюте без курса: принимается, но amountTjs = null ── */
  const noRateReq = await call('/requests', {
    method: 'POST', token: accountant,
    body: { kind: 'payment', name: `${STAMP} оплата в вонах`, amount: 100000, currency: NO_RATE },
  });
  if (noRateReq.json?.id) createdReqs.push(noRateReq.json.id);
  ok('заявка без курса принимается, но в сомони не считается',
    (noRateReq.status === 201 || noRateReq.status === 200) && noRateReq.json?.amountTjs === null,
    `HTTP ${noRateReq.status}, amountTjs=${noRateReq.json?.amountTjs}`);

  /* ── 9. Отчёты в сомони: план-факт видит пересчитанные суммы, а не цифры
         из форм. Ожидание считаем по тем же операциям, что создали. ── */
  const expected = AMOUNT_USD * RATE + 2000;
  const pf = (await call(`/planfact?from=${TODAY}&to=${TODAY}`, { token: admin })).json;
  const row = (pf.expenses as { cat: string; fact: number }[]).find((r) => r.cat === `Проверка ${STAMP}`);
  ok('расход в USD попал в план-факт в сомони',
    !!row && Math.abs(row.fact - expected) < 0.01,
    row ? `факт ${row.fact}, ожидали ${expected}` : 'строки нет');

  /* ── Уборка ── */
  if (created.length) {
    await call('/operations/bulk', { method: 'PATCH', token: admin, body: { ids: created, action: 'delete' } });
  }
  const director = await login(DIR);
  const leftovers: string[] = [];
  for (const id of createdReqs) {
    const del = await call(`/requests/${id}`, { method: 'DELETE', token: accountant });
    if (del.status >= 400) {
      // Отправленную заявку удалить нельзя — убираем её из очереди отказом
      await call(`/requests/${id}/status`, {
        method: 'PATCH', token: director,
        body: { status: 'rejected', comment: 'Проверка мультивалютности — заявка тестовая' },
      });
      leftovers.push(String(id));
    }
  }
  if (leftovers.length) console.log(`  прим.  тестовые заявки отклонены, но остались в базе: id ${leftovers.join(', ')}`);
  const after = (await call(`/planfact?from=${TODAY}&to=${TODAY}`, { token: admin })).json;
  ok('после уборки строки проверки нет',
    !(after.expenses as { cat: string }[]).some((r) => r.cat === `Проверка ${STAMP}`));
}

main()
  .then(() => {
    console.log(failed === 0 ? '\nМультивалютность: все проверки пройдены.\n' : `\nПровалено: ${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('Проверка не выполнена:', e);
    process.exit(2);
  });
