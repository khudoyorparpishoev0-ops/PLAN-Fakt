/** Проверка шести правил формата выгрузок Excel из дизайн-пакета.
 *
 *  Правила проверяются не по коду, а по содержимому готового файла: книга
 *  скачивается через API и разбирается exceljs. Всё, что видно в Excel,
 *  видно и здесь — числа числами, даты датами, закреплённая шапка, лист
 *  «Параметры».
 *
 *  Запуск (нужен поднятый сервер):
 *    API=http://localhost:3000/api ADMIN_PASSWORD=… npm run check:export */

import * as ExcelJS from 'exceljs';

const API = process.env.API ?? 'http://localhost:3000/api';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@it-hona.tj';
// В контейнере пароли приходят из /opt/app/.env как SEED_PASSWORD_*,
// поэтому все пять проверок запускаются одной и той же командой
const PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.SEED_PASSWORD_ADMIN ?? '';

let token = '';
let failures = 0;

function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name} — ${detail}`);
  if (!ok) failures++;
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login → ${res.status}`);
  token = ((await res.json()) as { accessToken: string }).accessToken;
}

async function download(path: string): Promise<{ wb: ExcelJS.Workbook; name: string; size: number }> {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''(.+)$/.exec(cd);
  return { wb, name: m ? decodeURIComponent(m[1]) : '', size: buf.length };
}

/** Первая строка данных под шапкой листа. */
function firstDataRow(ws: ExcelJS.Worksheet, headerTitle: string): ExcelJS.Row | null {
  let header = 0;
  ws.eachRow((row, n) => {
    if (header) return;
    if (String(row.getCell(1).value ?? '') === headerTitle) header = n;
  });
  if (!header) return null;
  for (let n = header + 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    if (row.getCell(1).value != null && String(row.getCell(1).value) !== '') return row;
  }
  return null;
}

async function main() {
  if (!PASSWORD) throw new Error('Задайте ADMIN_PASSWORD или SEED_PASSWORD_ADMIN — пароль администратора');
  await login();

  /* ── Журнал операций: полный состав колонок ────────────────────────────── */
  const ops = await download('/export/operations.xlsx?type=out');
  const ws = ops.wb.getWorksheet('Операции')!;
  const params = ops.wb.getWorksheet('Параметры');

  check('правило 6 · лист «Параметры» есть', !!params, params ? 'найден' : 'отсутствует');

  const head = firstDataRow(ws, 'Дата');
  check('шапка на месте', head != null, head ? `первая строка данных ${head.number}` : 'не найдена');

  if (head) {
    const date = head.getCell(1).value;
    check('правило 3 · даты выгружаются датами',
      date instanceof Date, `тип ячейки: ${date instanceof Date ? 'Date' : typeof date}`);
    check('правило 3 · формат даты читаемый',
      head.getCell(1).numFmt === 'dd.mm.yyyy', String(head.getCell(1).numFmt));

    const amountCol = 7;
    const amount = head.getCell(amountCol).value;
    check('правило 2 · числа выгружаются числами',
      typeof amount === 'number', `тип ячейки: ${typeof amount}`);
    check('правило 2 · денежный формат',
      head.getCell(amountCol).numFmt === '#,##0.00', String(head.getCell(amountCol).numFmt));

    const currency = head.getCell(8).value;
    check('правило 4 · валюта отдельной колонкой', currency === 'TJS', String(currency));
  }

  const frozen = ws.views?.[0];
  check('правило 5 · шапка закреплена',
    frozen?.state === 'frozen' && (frozen as { ySplit?: number }).ySplit! > 0,
    `${frozen?.state ?? 'нет'} / ySplit ${(frozen as { ySplit?: number } | undefined)?.ySplit ?? '—'}`);
  check('правило 5 · заголовок повторяется при печати',
    !!ws.pageSetup?.printTitlesRow, String(ws.pageSetup?.printTitlesRow ?? 'нет'));

  if (params) {
    const text = params.getSheetValues().map((r) => (Array.isArray(r) ? r.join(' ') : '')).join('\n');
    check('«Параметры» называют, кто выгрузил', /Кто выгрузил/.test(text) && /@/.test(text), 'есть имя и почта');
    check('«Параметры» называют время', /Когда/.test(text), 'есть отметка времени');
    check('правило 1 · фильтр экрана записан в «Параметры»',
      /Выплата/.test(text), 'фильтр «Тип операции: Выплата» виден в файле');
    check('«Параметры» перечисляют колонки', /Включены/.test(text), 'состав колонок записан');
  }

  /* ── Выбор колонок ─────────────────────────────────────────────────────── */
  const spec = await (await fetch(`${API}/export/columns`, { headers: { Authorization: `Bearer ${token}` } })).json() as
    { kinds: { code: string; columns: { key: string; locked: boolean }[] }[] };
  const opsSpec = spec.kinds.find((k) => k.code === 'operations')!;
  check('состав колонок отдаётся API', opsSpec.columns.length > 0, `${opsSpec.columns.length} колонок`);
  check('ключевые колонки помечены', opsSpec.columns.some((c) => c.locked),
    opsSpec.columns.filter((c) => c.locked).map((c) => c.key).join(', '));

  const narrow = await download('/export/operations.xlsx?columns=date,amount');
  const nws = narrow.wb.getWorksheet('Операции')!;
  const nhead = firstDataRow(nws, 'Дата');
  // Заблокированные добавляются всегда, даже если их не выбрали
  const locked = opsSpec.columns.filter((c) => c.locked).length;
  check('снятие колонок сокращает файл',
    nws.columnCount < ws.columnCount, `${ws.columnCount} → ${nws.columnCount} колонок`);
  check('ключевые колонки остаются даже без выбора',
    nws.columnCount >= locked, `в файле ${nws.columnCount}, обязательных ${locked}`);
  check('данные на месте после сокращения', nhead != null, nhead ? 'строки есть' : 'строк нет');
  check('имя файла отмечает неполный состав',
    /из/.test(narrow.name), narrow.name);
  check('полный файл называется без пометки',
    !/из/.test(ops.name), ops.name);
  check('сокращённый файл легче полного',
    narrow.size < ops.size, `${ops.size} → ${narrow.size} байт`);

  /* ── Остальные виды выгрузки ───────────────────────────────────────────── */
  for (const [path, sheet] of [['/export/report.xlsx', 'План-Факт'], ['/export/projects.xlsx', 'Проекты']] as const) {
    const f = await download(path);
    const s = f.wb.getWorksheet(sheet)!;
    check(`${sheet}: лист «Параметры» есть`, !!f.wb.getWorksheet('Параметры'), f.name);
    check(`${sheet}: шапка закреплена`, f.wb.getWorksheet(sheet)!.views?.[0]?.state === 'frozen',
      String(s.views?.[0]?.state ?? 'нет'));
  }

  console.log(failures === 0 ? '\nШесть правил формата соблюдаются.\n' : `\nПровалено проверок: ${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nПроверка не выполнена:', e instanceof Error ? e.message : e, '\n');
  process.exit(2);
});
