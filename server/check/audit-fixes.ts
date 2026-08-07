/** Регресс-тест дефектов, найденных аудитом 07.08.2026.
 *
 *  Каждая проверка соответствует ошибке, которая уже была в системе.
 *  Тест «зелёный» на исправленном коде и «красный» на прежнем — иначе он
 *  ничего не сторожит.
 *
 *  Запуск (нужен работающий API на :3000):
 *    npm run check:audit
 *
 *  Уборка: операции и сделки помечаются удалёнными, заявки — отклоняются
 *  директором (удалить отправленную заявку нельзя, ТЗ п. 8).
 */

const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const PW = process.env.SEED_PASSWORD_ADMIN ?? 'Test-12345';
const ADMIN = { email: 'admin@it-hona.tj', password: PW };
const DIR = { email: 'director@it-hona.tj', password: PW };
const ACC = { email: 'accountant@it-hona.tj', password: PW };

let failed = 0;
const ok = (name: string, pass: boolean, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failed++;
};

interface Res { status: number; json: any; headers: Headers }
async function call(path: string, init: (RequestInit & { body?: unknown; token?: string }) = {}): Promise<Res> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text.slice(0, 200); }
  return { status: res.status, json, headers: res.headers };
}
const login = async (who: { email: string; password: string }) =>
  (await call('/auth/login', { method: 'POST', body: who })).json.accessToken as string;

const STAMP = `TEST-QA-${process.pid}`;
const ART = `TEST-QA статья ${process.pid}`;
const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  const admin = await login(ADMIN);
  const dir = await login(DIR);
  const acc = await login(ACC);
  const ops: number[] = [];
  const deals: number[] = [];
  const reqs: number[] = [];

  const mkOp = async (body: Record<string, unknown>) => {
    const r = await call('/operations', { method: 'POST', token: admin, body: { articleName: ART, ...body } });
    if (r.json?.id) ops.push(r.json.id);
    return r;
  };

  /* ── 1. FIN-001: обещание оплаты не закрывает долг по сделке ──
     Было: плановая операция, привязанная к сделке, попадала в «оплачено»,
     и задолженность поставщику обнулялась деньгами, которые не ушли. */
  console.log('\n── Сделка: оплатой считается только ушедший платёж ──');
  const cp = (await call('/dictionaries', { token: admin })).json?.counterparties?.[0];
  const deal = await call('/deals', {
    method: 'POST', token: admin,
    body: {
      title: `${STAMP} закупка`, date: TODAY, counterpartyId: cp?.id,
      positions: [{ name: `${STAMP} кабель`, qty: 10, price: 1000 }],
    },
  });
  const dealId = deal.json?.id as number;
  if (dealId) deals.push(dealId);
  const dealNow = async () => (await call('/deals', { token: admin })).json.find((d: any) => d.id === dealId);
  ok('сделка 10 × 1000 = 10 000', (await dealNow())?.total === 10000, `total=${(await dealNow())?.total}`);

  const realPay = await mkOp({ date: TODAY, type: 'out', amount: 3000, counterpartyName: cp?.name, comment: `${STAMP} оплата` });
  await call(`/deals/${dealId}/payments`, { method: 'POST', token: admin, body: { operationIds: [realPay.json.id] } });
  ok('состоявшаяся выплата попадает в «оплачено»', (await dealNow())?.paid === 3000, `paid=${(await dealNow())?.paid}`);

  const promise = await mkOp({
    date: TODAY, type: 'out', amount: 7000, isPlan: true,
    counterpartyName: cp?.name, comment: `${STAMP} плановая, деньги не ушли`,
  });
  const attach = await call(`/deals/${dealId}/payments`, { method: 'POST', token: admin, body: { operationIds: [promise.json.id] } });
  ok('плановую операцию прикрепить нельзя → 422', attach.status === 422, `HTTP ${attach.status} ${attach.json?.error?.code ?? ''}`);
  ok('долг по сделке не закрылся обещанием', (await dealNow())?.paid === 3000, `paid=${(await dealNow())?.paid}`);

  const candidates = (await call(`/deals/${dealId}/payment-candidates`, { token: admin })).json;
  ok('плановая операция не предлагается в кандидаты',
    !(candidates ?? []).some((c: any) => c.id === promise.json.id), `кандидатов: ${candidates?.length}`);

  /* ── 2. FIN-002: сумма за пределом точности дирамов ──
     Было: 1e15 сомони принимались; на границе JSON такие числа перестают
     быть точными, и отчёт возвращает не то, что записано. */
  console.log('\n── Деньги: предел точности ──');
  const tooBig = await mkOp({ date: TODAY, type: 'out', amount: 1e15 });
  ok('сумма за пределом точности → 422', tooBig.status === 422,
    `HTTP ${tooBig.status} ${tooBig.json?.error?.code ?? ''}`);
  const stillOk = await mkOp({ date: TODAY, type: 'out', amount: 1_000_000_000 });
  ok('миллиард сомони по-прежнему принимается', stillOk.status === 201, `HTTP ${stillOk.status}`);
  ok('и возвращается без потерь', stillOk.json?.amount === 1_000_000_000, String(stillOk.json?.amount));
  const bigReq = await call('/requests', {
    method: 'POST', token: acc, body: { kind: 'payment', name: `${STAMP} гигантская`, amount: 1e15 },
  });
  if (bigReq.json?.id) reqs.push(bigReq.json.id);
  ok('заявка с такой же суммой тоже отклоняется', bigReq.status === 422, `HTTP ${bigReq.status}`);

  /* ── 3. QA-003: поездка при незаданной ставке ──
     Было: одобрение создавало расход на 0 сомони и выглядело успешным. */
  console.log('\n── Поездка без ставки компенсации ──');
  const settings = (await call('/settings', { token: admin })).json;
  const savedRate = settings.kmRate;
  await call('/settings', { method: 'PATCH', token: admin, body: { kmRate: 0 } });
  const trip = await call('/requests', {
    method: 'POST', token: acc,
    body: { kind: 'trip', name: `${STAMP} поездка`, km: 100, attachment: { key: `${STAMP}/odo`, fileName: 'odo.jpg' } },
  });
  if (trip.json?.id) reqs.push(trip.json.id);
  const approveNoRate = await call(`/requests/${trip.json?.id}/status`, {
    method: 'PATCH', token: dir, body: { status: 'approved' },
  });
  ok('одобрить поездку без ставки нельзя → 422', approveNoRate.status === 422,
    `HTTP ${approveNoRate.status} ${approveNoRate.json?.error?.code ?? ''}`);
  await call('/settings', { method: 'PATCH', token: admin, body: { kmRate: 3 } });
  const approveWithRate = await call(`/requests/${trip.json?.id}/status`, {
    method: 'PATCH', token: dir, body: { status: 'approved' },
  });
  ok('со ставкой поездка одобряется', approveWithRate.status === 200, `HTTP ${approveWithRate.status}`);
  const tripOp = (await call(`/operations?q=${encodeURIComponent(trip.json?.number)}&limit=5`, { token: admin })).json;
  ok('100 км × 3 = 300 сомони', tripOp.rows?.[0]?.amount === 300, `операция на ${tripOp.rows?.[0]?.amount}`);
  await call('/settings', { method: 'PATCH', token: admin, body: { kmRate: savedRate } });

  /* ── 4. SEC-001: перебор пароля ──
     Было: 25 неверных паролей подряд — 25 ответов 401 и ни одной задержки. */
  console.log('\n── Перебор пароля ──');
  const victim = `qa-throttle-${process.pid}@it-hona.tj`;
  let code = 0;
  for (let i = 0; i < 12 && code !== 429; i++) {
    code = (await call('/auth/login', { method: 'POST', body: { email: victim, password: `нет-${i}` } })).status;
  }
  ok('подбор пароля упирается в 429', code === 429, `последний код ${code}`);
  const retryAfter = (await call('/auth/login', { method: 'POST', body: { email: victim, password: 'x' } })).headers.get('retry-after');
  ok('в ответе есть Retry-After', !!retryAfter, `${retryAfter} с`);
  // Блокировка адресная: настоящий пользователь входит как ни в чём не бывало
  ok('чужой перебор не мешает войти админу', (await call('/auth/login', { method: 'POST', body: ADMIN })).status === 200);

  /* ── 5. SEC-002: заголовки безопасности ── */
  console.log('\n── Заголовки безопасности ──');
  const h = (await call('/health')).headers;
  ok('X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff', h.get('x-content-type-options') ?? 'нет');
  ok('X-Frame-Options: DENY', h.get('x-frame-options') === 'DENY', h.get('x-frame-options') ?? 'нет');
  ok('Referrer-Policy', !!h.get('referrer-policy'), h.get('referrer-policy') ?? 'нет');
  ok('сервер не представляется (X-Powered-By)', !h.get('x-powered-by'), h.get('x-powered-by') ?? 'заголовка нет');

  /* ── 6. SEC-003: тип файла по подписи, а не по слову клиента ── */
  console.log('\n── Загрузка файлов ──');
  const upload = async (bytes: Buffer, name: string, mime: string) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), name);
    const res = await fetch(`${BASE}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${acc}` }, body: form });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x41)]);
  const fake = await upload(exe, 'счёт.pdf', 'application/pdf');
  ok('исполняемый файл под видом PDF отклоняется', fake.status === 422,
    `HTTP ${fake.status} ${fake.json?.error?.code ?? ''}`);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);
  const real = await upload(pdf, 'счёт.pdf', 'application/octet-stream');
  ok('настоящий PDF принимается даже с чужим Content-Type', real.status === 201, `HTTP ${real.status}`);
  ok('тип определён по содержимому', real.json?.mime === 'application/pdf', String(real.json?.mime));

  /* ── 7. Вход с пробелами вокруг адреса ── */
  const spaced = await call('/auth/login', { method: 'POST', body: { email: '  admin@it-hona.tj  ', password: PW } });
  ok('адрес с пробелами по краям принимается', spaced.status === 200, `HTTP ${spaced.status}`);

  /* ── Уборка ── */
  console.log('\n── Уборка ──');
  if (ops.length) await call('/operations/bulk', { method: 'PATCH', token: admin, body: { ids: ops, action: 'delete' } });
  for (const id of deals) await call(`/deals/${id}`, { method: 'DELETE', token: admin });
  for (const id of reqs) {
    const del = await call(`/requests/${id}`, { method: 'DELETE', token: acc });
    if (del.status >= 400) {
      const st = await call(`/requests/${id}/status`, {
        method: 'PATCH', token: dir, body: { status: 'rejected', comment: 'TEST-QA уборка' },
      });
      if (st.status >= 400) await call(`/requests/${id}/storno`, { method: 'PATCH', token: dir, body: { comment: 'TEST-QA уборка' } });
    }
  }
  console.log(`  операций ${ops.length}, сделок ${deals.length}, заявок ${reqs.length}`);
}

main()
  .then(() => {
    console.log(failed === 0 ? '\nРегресс аудита: все проверки пройдены.\n' : `\nПровалено: ${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('Проверка не выполнена:', e);
    process.exit(2);
  });
