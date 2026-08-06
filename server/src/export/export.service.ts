import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DataService } from '../data/data.service';
import type { OperationFilters } from '../data/operations.dto';
import { BASE_CURRENCY } from '../currency';

/** Виды выгрузок, доступные и по кнопке, и по расписанию. */
export type ExportKind = 'report' | 'projects' | 'operations';

export const EXPORT_LABEL: Record<ExportKind, string> = {
  report: 'Отчёт «План-Факт»',
  projects: 'Проекты',
  operations: 'Журнал операций',
};

const FILE_NAME: Record<ExportKind, string> = {
  report: 'план-факт',
  projects: 'проекты',
  operations: 'операции',
};

const MONEY = '#,##0.00';
const DATE = 'dd.mm.yyyy';

/** Тип значения в колонке — от него зависит формат ячейки.
 *  Правила 2 и 3 формата: числа выгружаются числами, даты — датами,
 *  иначе Excel их не складывает и не сортирует. */
type ColType = 'text' | 'money' | 'date' | 'int';

export interface ColumnSpec {
  key: string;
  title: string;
  width: number;
  type: ColType;
  /** Без этой колонки файл не сойдётся с отчётом на экране — снять нельзя. */
  locked?: boolean;
}

/** Состав колонок по видам выгрузки. Ключевые заблокированы: без даты и
 *  суммы журнал операций перестаёт быть журналом. */
export const COLUMNS: Record<ExportKind, ColumnSpec[]> = {
  report: [
    { key: 'n', title: '№', width: 10, type: 'text' },
    { key: 'cat', title: 'Категория', width: 36, type: 'text', locked: true },
    { key: 'proj', title: 'Проект', width: 28, type: 'text' },
    { key: 'party', title: 'Контрагент', width: 26, type: 'text' },
    { key: 'plan', title: 'План', width: 14, type: 'money', locked: true },
    { key: 'fact', title: 'Факт', width: 14, type: 'money', locked: true },
    { key: 'dev', title: 'Отклонение', width: 14, type: 'money' },
    { key: 'currency', title: 'Валюта', width: 10, type: 'text' },
    { key: 'status', title: 'Статус', width: 22, type: 'text' },
    { key: 'resp', title: 'Ответственный', width: 18, type: 'text' },
  ],
  projects: [
    { key: 'name', title: 'Проект', width: 34, type: 'text', locked: true },
    { key: 'group', title: 'Группа', width: 26, type: 'text' },
    { key: 'resp', title: 'Ответственный', width: 18, type: 'text' },
    { key: 'status', title: 'Статус', width: 14, type: 'text' },
    { key: 'start', title: 'Начало', width: 13, type: 'date' },
    { key: 'end', title: 'Конец', width: 13, type: 'date' },
    { key: 'inF', title: 'Доходы факт', width: 16, type: 'money', locked: true },
    { key: 'outF', title: 'Расходы факт', width: 16, type: 'money', locked: true },
    { key: 'inP', title: 'Доходы план', width: 16, type: 'money' },
    { key: 'outP', title: 'Расходы план', width: 16, type: 'money' },
    { key: 'profit', title: 'Прибыль факт', width: 16, type: 'money' },
    { key: 'currency', title: 'Валюта', width: 10, type: 'text' },
  ],
  operations: [
    { key: 'date', title: 'Дата', width: 12, type: 'date', locked: true },
    { key: 'account', title: 'Счёт', width: 24, type: 'text' },
    { key: 'type', title: 'Тип', width: 14, type: 'text' },
    { key: 'party', title: 'Контрагент', width: 26, type: 'text' },
    { key: 'article', title: 'Статья', width: 30, type: 'text', locked: true },
    { key: 'project', title: 'Проект', width: 26, type: 'text' },
    { key: 'amount', title: 'Сумма', width: 16, type: 'money', locked: true },
    { key: 'currency', title: 'Валюта', width: 10, type: 'text' },
    { key: 'confirmed', title: 'Оплата', width: 16, type: 'text' },
    { key: 'comment', title: 'Примечание', width: 34, type: 'text' },
  ],
};

/** Кто и с какими фильтрами заказал выгрузку — уходит на лист «Параметры». */
export interface ExportMeta {
  who?: string;
  /** Читаемое описание фильтров, по одному пункту на строку. */
  filters?: [string, string][];
}

export interface ExportOptions extends ExportMeta {
  /** Выбранные колонки; пусто — все. Заблокированные добавляются всегда. */
  columns?: string[];
  /** Включить архивные проекты (решение 11); по умолчанию архив не выгружается. */
  archived?: boolean;
}

/** Дата для ячейки Excel. Полдень локального дня, чтобы часовой пояс не
 *  сдвинул её на сутки назад при чтении файла в другом регионе. */
function excelDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/** Построение книг Excel. Вынесено из контроллера, чтобы теми же отчётами
 *  пользовался планировщик выгрузок (ТЗ, п. 11 — выгрузки по расписанию).
 *
 *  Шесть правил формата из дизайн-пакета:
 *    1. файл повторяет текущую выборку с фильтрами, а не всю базу;
 *    2. числа выгружаются числами;
 *    3. даты — датами;
 *    4. валюта отдельной колонкой, без приведения;
 *    5. шапка закреплена, заголовок повторяется при печати;
 *    6. второй лист — параметры выгрузки. */
@Injectable()
export class ExportService {
  constructor(private readonly data: DataService) {}

  /** Имя файла: вид, дата и пометка о неполном составе колонок. */
  fileName(kind: ExportKind, opts?: ExportOptions): string {
    const day = new Date().toISOString().slice(0, 10);
    const all = COLUMNS[kind].length;
    const picked = this.pick(kind, opts?.columns).length;
    const part = picked < all ? `-${picked}из${all}` : '';
    return `${FILE_NAME[kind]}-${day}${part}.xlsx`;
  }

  /** Итоговый список колонок: выбранные плюс обязательные, в исходном порядке. */
  private pick(kind: ExportKind, columns?: string[]): ColumnSpec[] {
    const spec = COLUMNS[kind];
    if (!columns?.length) return spec;
    const set = new Set(columns);
    return spec.filter((c) => c.locked || set.has(c.key));
  }

  async build(kind: ExportKind, filters?: OperationFilters, opts?: ExportOptions): Promise<ExcelJS.Workbook> {
    const cols = this.pick(kind, opts?.columns);
    const includeArchived = !!opts?.archived;
    const wb =
      kind === 'report' ? await this.report(cols, includeArchived)
      : kind === 'projects' ? await this.projects(cols, includeArchived)
      : await this.operations(cols, { ...(filters ?? {}), excludeArchived: !includeArchived });
    this.paramsSheet(wb, kind, cols, opts);
    return wb;
  }

  async buildBuffer(kind: ExportKind, filters?: OperationFilters, opts?: ExportOptions): Promise<Buffer> {
    const wb = await this.build(kind, filters, opts);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /* ── Общая машинерия листа ────────────────────────────────────────────── */

  private sheet(wb: ExcelJS.Workbook, name: string, cols: ColumnSpec[], title: string) {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((c) => ({ width: c.width }));
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([]);
    return ws;
  }

  private headerRow(ws: ExcelJS.Worksheet, cols: ColumnSpec[]) {
    const row = ws.addRow(cols.map((c) => c.title));
    row.font = { bold: true };
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1EE' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFC8CCC8' } } };
    });
    // Правило 5: шапка закреплена и повторяется на каждой печатной странице.
    ws.views = [{ state: 'frozen', ySplit: row.number }];
    ws.pageSetup = { ...ws.pageSetup, printTitlesRow: `${row.number}:${row.number}` };
    return row;
  }

  /** Строка данных: значения берутся по ключам колонок, формат — по типу. */
  private dataRow(ws: ExcelJS.Worksheet, cols: ColumnSpec[], values: Record<string, unknown>, bold = false) {
    const row = ws.addRow(cols.map((c) => {
      const v = values[c.key];
      if (c.type === 'date') return excelDate(v as string) ?? '—';
      return v ?? (c.type === 'money' || c.type === 'int' ? 0 : '—');
    }));
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.type === 'money') cell.numFmt = MONEY;
      if (c.type === 'date' && cell.value instanceof Date) cell.numFmt = DATE;
    });
    if (bold) row.font = { bold: true };
    return row;
  }

  /** Правило 6: лист «Параметры» — кто, когда, с какими фильтрами и колонками.
   *  Без него через месяц никто не поймёт, откуда цифры в файле. */
  private paramsSheet(wb: ExcelJS.Workbook, kind: ExportKind, cols: ColumnSpec[], opts?: ExportOptions) {
    const ws = wb.addWorksheet('Параметры');
    ws.columns = [{ width: 28 }, { width: 60 }];
    ws.addRow(['Параметры выгрузки']).font = { bold: true, size: 13 };
    ws.addRow([]);
    const put = (k: string, v: string) => {
      const row = ws.addRow([k, v]);
      row.getCell(1).font = { bold: true };
      return row;
    };
    put('Выгрузка', EXPORT_LABEL[kind]);
    put('Кто выгрузил', opts?.who ?? '—');
    const now = new Date();
    const stamp = ws.addRow(['Когда', now]);
    stamp.getCell(1).font = { bold: true };
    stamp.getCell(2).numFmt = 'dd.mm.yyyy hh:mm';
    put('Валюта учёта', `${BASE_CURRENCY} — сомони; валютные операции пересчитаны по курсу на дату`);
    put('Организация', 'IT-HONA LLC');
    put('Архивные проекты', opts?.archived ? 'включены' : 'не включены');
    ws.addRow([]);
    ws.addRow(['Фильтры']).font = { bold: true, size: 12 };
    const filters = opts?.filters ?? [];
    if (filters.length === 0) put('Без фильтров', 'выгружены все записи');
    else filters.forEach(([k, v]) => put(k, v));
    ws.addRow([]);
    ws.addRow(['Колонки']).font = { bold: true, size: 12 };
    const all = COLUMNS[kind];
    put('Включены', cols.map((c) => c.title).join(', '));
    const off = all.filter((c) => !cols.includes(c));
    put('Исключены', off.length ? off.map((c) => c.title).join(', ') : 'нет — файл полный');
  }

  /* ── Выгрузки ─────────────────────────────────────────────────────────── */

  private async report(cols: ColumnSpec[], includeArchived: boolean): Promise<ExcelJS.Workbook> {
    const pf = await this.data.planFact(undefined, undefined, { includeArchived });
    const wb = new ExcelJS.Workbook();
    const ws = this.sheet(wb, 'План-Факт', cols, `Сводный отчёт «План-Факт» · суммы в ${BASE_CURRENCY}`);

    const section = (title: string, rows: typeof pf.incomes) => {
      ws.addRow([title]).font = { bold: true, size: 12 };
      this.headerRow(ws, cols);
      let plan = 0, fact = 0;
      for (const r of rows) {
        this.dataRow(ws, cols, {
          n: r.n, cat: r.cat, proj: r.proj, party: r.party,
          plan: r.plan, fact: r.fact, dev: r.fact - r.plan,
          currency: BASE_CURRENCY, status: r.status, resp: r.resp,
        });
        plan += r.plan; fact += r.fact;
      }
      this.dataRow(ws, cols, { cat: 'Итого', plan, fact, dev: fact - plan, currency: BASE_CURRENCY }, true);
      ws.addRow([]);
      return { plan, fact };
    };

    const inc = section('ДОХОДЫ', pf.incomes);
    const exp = section('РАСХОДЫ', pf.expenses);
    this.dataRow(ws, cols, {
      cat: 'ПРИБЫЛЬ', plan: inc.plan - exp.plan, fact: inc.fact - exp.fact,
      dev: (inc.fact - exp.fact) - (inc.plan - exp.plan), currency: BASE_CURRENCY,
    }, true);
    return wb;
  }

  private async projects(cols: ColumnSpec[], includeArchived: boolean): Promise<ExcelJS.Workbook> {
    const projects = (await this.data.projects('admin')) as Array<{
      name: string; group: string; resp: string; status: string; archived: boolean;
      start: string | null; end: string | null; inF?: number; outF?: number; inP?: number; outP?: number;
    }>;
    const wb = new ExcelJS.Workbook();
    const ws = this.sheet(wb, 'Проекты', cols, `Проекты · суммы в ${BASE_CURRENCY}`);
    this.headerRow(ws, cols);
    const STATUS: Record<string, string> = { plan: 'Плановый', work: 'В работе', done: 'Завершён' };
    for (const p of projects) {
      if (!includeArchived && p.archived) continue;
      this.dataRow(ws, cols, {
        name: p.name + (p.archived ? ' (архив)' : ''), group: p.group, resp: p.resp,
        status: STATUS[p.status] ?? p.status, start: p.start, end: p.end,
        inF: p.inF ?? 0, outF: p.outF ?? 0, inP: p.inP ?? 0, outP: p.outP ?? 0,
        profit: (p.inF ?? 0) - (p.outF ?? 0), currency: BASE_CURRENCY,
      });
    }
    return wb;
  }

  private async operations(cols: ColumnSpec[], filters: OperationFilters): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    const ws = this.sheet(wb, 'Операции', cols, `Журнал операций · суммы в ${BASE_CURRENCY}`);
    this.headerRow(ws, cols);
    const TYPE: Record<string, string> = { in: 'Поступление', out: 'Выплата', move: 'Перемещение', accrual: 'Начисление' };
    let total = 0;
    // Правило 1: выгружается весь отфильтрованный список, а не одна страница
    for (let offset = 0; ; offset += 200) {
      const page = await this.data.operations({ ...filters, limit: 200, offset });
      for (const o of page.rows) {
        const signed = o.type === 'in' ? o.amount : -o.amount;
        this.dataRow(ws, cols, {
          date: o.date, account: o.account, type: TYPE[o.type] ?? o.type, party: o.party,
          article: (o.article ?? '—') + (o.isPlan ? ' (план)' : ''), project: o.project,
          amount: signed, currency: BASE_CURRENCY,
          confirmed: o.confirmed ? 'Подтверждена' : 'Не подтверждена', comment: o.comment ?? '',
        });
        total += signed;
      }
      if (offset + page.rows.length >= page.total || page.rows.length === 0) break;
    }
    this.dataRow(ws, cols, { article: 'Итого', amount: total, currency: BASE_CURRENCY }, true);
    return wb;
  }
}
