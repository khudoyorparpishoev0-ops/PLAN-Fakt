import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { DataService } from '../data/data.service';

/** Экспорт в Excel (ТЗ, п. 9 и критерии приёмки п. 11):
 *  отчёт «План-Факт» и список проектов. Только админ/директор. */
@Controller('export')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class ExportController {
  constructor(private readonly data: DataService) {}

  private async send(res: Response, wb: ExcelJS.Workbook, fileName: string) {
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(Buffer.from(buf));
  }

  private headerRow(ws: ExcelJS.Worksheet, titles: string[]) {
    const row = ws.addRow(titles);
    row.font = { bold: true };
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1EE' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFC8CCC8' } } };
    });
  }

  @Get('report.xlsx')
  @Roles('admin', 'director')
  async report(@Res() res: Response) {
    const pf = await this.data.planFact();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('План-Факт');
    ws.columns = [
      { width: 10 }, { width: 36 }, { width: 28 }, { width: 26 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 18 },
    ];
    ws.addRow(['Сводный отчёт «План-Факт» · суммы в сомони (TJS)']).font = { bold: true, size: 13 };
    ws.addRow([]);
    const numFmt = '#,##0.00';
    const section = (title: string, rows: typeof pf.incomes) => {
      ws.addRow([title]).font = { bold: true, size: 12 };
      this.headerRow(ws, ['№', 'Категория', 'Проект', 'Контрагент', 'План', 'Факт', 'Отклонение', 'Статус', 'Ответственный']);
      let plan = 0, fact = 0;
      for (const r of rows) {
        const row = ws.addRow([r.n, r.cat, r.proj, r.party, r.plan, r.fact, r.fact - r.plan, r.status, r.resp]);
        [5, 6, 7].forEach((i) => { row.getCell(i).numFmt = numFmt; });
        plan += r.plan; fact += r.fact;
      }
      const total = ws.addRow(['', 'Итого', '', '', plan, fact, fact - plan, '', '']);
      total.font = { bold: true };
      [5, 6, 7].forEach((i) => { total.getCell(i).numFmt = numFmt; });
      ws.addRow([]);
      return { plan, fact };
    };
    const inc = section('ДОХОДЫ', pf.incomes);
    const exp = section('РАСХОДЫ', pf.expenses);
    const profit = ws.addRow(['', 'ПРИБЫЛЬ', '', '', inc.plan - exp.plan, inc.fact - exp.fact, '', '', '']);
    profit.font = { bold: true, size: 12 };
    [5, 6].forEach((i) => { profit.getCell(i).numFmt = numFmt; });
    await this.send(res, wb, 'план-факт.xlsx');
  }

  @Get('projects.xlsx')
  @Roles('admin', 'director')
  async projects(@Res() res: Response) {
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
      [7, 8, 9, 10, 11].forEach((i) => { row.getCell(i).numFmt = '#,##0.00'; });
    }
    await this.send(res, wb, 'проекты.xlsx');
  }
}
