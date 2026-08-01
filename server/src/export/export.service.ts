import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DataService } from '../data/data.service';
import type { OperationFilters } from '../data/operations.dto';

/** Виды выгрузок, доступные и по кнопке, и по расписанию. */
export type ExportKind = 'report' | 'projects' | 'operations';

export const EXPORT_LABEL: Record<ExportKind, string> = {
  report: 'Отчёт «План-Факт»',
  projects: 'Проекты',
  operations: 'Журнал операций',
};

const FILE_NAME: Record<ExportKind, string> = {
  report: 'план-факт.xlsx',
  projects: 'проекты.xlsx',
  operations: 'операции.xlsx',
};

const MONEY = '#,##0.00';

/** Построение книг Excel. Вынесено из контроллера, чтобы теми же отчётами
 *  пользовался планировщик выгрузок (ТЗ, п. 11 — выгрузки по расписанию). */
@Injectable()
export class ExportService {
  constructor(private readonly data: DataService) {}

  fileName(kind: ExportKind): string {
    return FILE_NAME[kind];
  }

  private headerRow(ws: ExcelJS.Worksheet, titles: string[]) {
    const row = ws.addRow(titles);
    row.font = { bold: true };
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1EE' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFC8CCC8' } } };
    });
  }

  /** Книга по виду выгрузки; фильтры используются только журналом. */
  async build(kind: ExportKind, filters?: OperationFilters): Promise<ExcelJS.Workbook> {
    if (kind === 'report') return this.report();
    if (kind === 'projects') return this.projects();
    return this.operations(filters ?? {});
  }

  async buildBuffer(kind: ExportKind, filters?: OperationFilters): Promise<Buffer> {
    const wb = await this.build(kind, filters);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async report(): Promise<ExcelJS.Workbook> {
    const pf = await this.data.planFact();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('План-Факт');
    ws.columns = [
      { width: 10 }, { width: 36 }, { width: 28 }, { width: 26 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 18 },
    ];
    ws.addRow(['Сводный отчёт «План-Факт» · суммы в сомони (TJS)']).font = { bold: true, size: 13 };
    ws.addRow([]);
    const section = (title: string, rows: typeof pf.incomes) => {
      ws.addRow([title]).font = { bold: true, size: 12 };
      this.headerRow(ws, ['№', 'Категория', 'Проект', 'Контрагент', 'План', 'Факт', 'Отклонение', 'Статус', 'Ответственный']);
      let plan = 0, fact = 0;
      for (const r of rows) {
        const row = ws.addRow([r.n, r.cat, r.proj, r.party, r.plan, r.fact, r.fact - r.plan, r.status, r.resp]);
        [5, 6, 7].forEach((i) => { row.getCell(i).numFmt = MONEY; });
        plan += r.plan; fact += r.fact;
      }
      const total = ws.addRow(['', 'Итого', '', '', plan, fact, fact - plan, '', '']);
      total.font = { bold: true };
      [5, 6, 7].forEach((i) => { total.getCell(i).numFmt = MONEY; });
      ws.addRow([]);
      return { plan, fact };
    };
    const inc = section('ДОХОДЫ', pf.incomes);
    const exp = section('РАСХОДЫ', pf.expenses);
    const profit = ws.addRow(['', 'ПРИБЫЛЬ', '', '', inc.plan - exp.plan, inc.fact - exp.fact, '', '', '']);
    profit.font = { bold: true, size: 12 };
    [5, 6].forEach((i) => { profit.getCell(i).numFmt = MONEY; });
    return wb;
  }

  private async projects(): Promise<ExcelJS.Workbook> {
    const projects = (await this.data.projects('admin')) as Array<{
      name: string; group: string; resp: string; status: string; archived: boolean;
      start: string | null; end: string | null; inF?: number; outF?: number; inP?: number; outP?: number;
    }>;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Проекты');
    ws.columns = [
      { width: 34 }, { width: 26 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 },
      { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    ];
    ws.addRow(['Проекты · суммы в сомони (TJS)']).font = { bold: true, size: 13 };
    ws.addRow([]);
    this.headerRow(ws, ['Проект', 'Группа', 'Ответственный', 'Статус', 'Начало', 'Конец', 'Доходы факт', 'Расходы факт', 'Доходы план', 'Расходы план', 'Прибыль факт']);
    const STATUS: Record<string, string> = { plan: 'Плановый', work: 'В работе', done: 'Завершён' };
    for (const p of projects) {
      const row = ws.addRow([
        p.name + (p.archived ? ' (архив)' : ''), p.group, p.resp, STATUS[p.status] ?? p.status,
        p.start ?? '—', p.end ?? '—',
        p.inF ?? 0, p.outF ?? 0, p.inP ?? 0, p.outP ?? 0, (p.inF ?? 0) - (p.outF ?? 0),
      ]);
      [7, 8, 9, 10, 11].forEach((i) => { row.getCell(i).numFmt = MONEY; });
    }
    return wb;
  }

  private async operations(filters: OperationFilters): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Операции');
    ws.columns = [
      { width: 12 }, { width: 24 }, { width: 14 }, { width: 26 }, { width: 30 },
      { width: 26 }, { width: 16 }, { width: 16 }, { width: 34 },
    ];
    ws.addRow(['Журнал операций · суммы в сомони (TJS)']).font = { bold: true, size: 13 };
    ws.addRow([]);
    this.headerRow(ws, ['Дата', 'Счёт', 'Тип', 'Контрагент', 'Статья', 'Проект', 'Сумма', 'Оплата', 'Примечание']);
    const TYPE: Record<string, string> = { in: 'Поступление', out: 'Выплата', move: 'Перемещение', accrual: 'Начисление' };
    let total = 0;
    // Выгружаем весь отфильтрованный список постранично, а не одну страницу
    for (let offset = 0; ; offset += 200) {
      const page = await this.data.operations({ ...filters, limit: 200, offset });
      for (const o of page.rows) {
        const signed = o.type === 'in' ? o.amount : -o.amount;
        const row = ws.addRow([
          o.date, o.account ?? '—', TYPE[o.type] ?? o.type, o.party ?? '—',
          (o.article ?? '—') + (o.isPlan ? ' (план)' : ''), o.project ?? '—',
          signed, o.confirmed ? 'Подтверждена' : 'Не подтверждена', o.comment ?? '',
        ]);
        row.getCell(7).numFmt = MONEY;
        total += signed;
      }
      if (offset + page.rows.length >= page.total || page.rows.length === 0) break;
    }
    const totalRow = ws.addRow(['', 'Итого', '', '', '', '', total, '', '']);
    totalRow.font = { bold: true };
    totalRow.getCell(7).numFmt = MONEY;
    return wb;
  }
}
