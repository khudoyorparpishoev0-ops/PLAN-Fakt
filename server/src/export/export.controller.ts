import {
  Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Param, ParseIntPipe, Patch, Post,
  Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import type { OperationFilters } from '../data/operations.dto';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage.service';
import { EXPORT_LABEL, ExportService, type ExportKind } from './export.service';
import { EXPORT_KINDS, ExportScheduleService, FREQUENCIES, FREQUENCY_LABEL, nextRun } from './schedule.service';

/** Число из query-строки: пустое и нечисловое → undefined. */
const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

export class ScheduleDto {
  @IsIn(EXPORT_KINDS, { message: 'kind: report | projects | operations' })
  kind!: ExportKind;

  @IsIn(FREQUENCIES, { message: 'frequency: daily | weekly | monthly' })
  frequency!: string;

  @IsOptional() @IsInt() @Min(0) @Max(23)
  hourUtc?: number;

  @IsOptional() @IsEmail({}, { message: 'Неверный email получателя' })
  email?: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

export class UpdateScheduleDto {
  @IsOptional() @IsIn(FREQUENCIES) frequency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(23) hourUtc?: number;
  @IsOptional() @IsEmail({}, { message: 'Неверный email получателя' }) email?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

/** Экспорт в Excel (ТЗ, п. 9 и критерии приёмки п. 11): отчёт «План-Факт»,
 *  проекты, журнал операций — по кнопке и по расписанию. Только админ/директор. */
@Controller('export')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly schedule: ExportScheduleService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async send(res: Response, buf: Buffer, fileName: string) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buf);
  }

  @Get('report.xlsx')
  @Roles('admin', 'director')
  async report(@Res() res: Response) {
    await this.send(res, await this.exports.buildBuffer('report'), this.exports.fileName('report'));
  }

  @Get('projects.xlsx')
  @Roles('admin', 'director')
  async projects(@Res() res: Response) {
    await this.send(res, await this.exports.buildBuffer('projects'), this.exports.fileName('projects'));
  }

  /** Журнал операций с теми же фильтрами, что и на экране (ТЗ, п. 3.2). */
  @Get('operations.xlsx')
  @Roles('admin', 'director')
  async operations(@Res() res: Response, @Query() q: Record<string, string | undefined>) {
    const filters: OperationFilters = {
      type: q.type
        ? (q.type.split(',').filter((t) => ['in', 'out', 'move', 'accrual'].includes(t)) as OperationFilters['type'])
        : undefined,
      confirmed: q.confirmed === 'true' || q.confirmed === 'false' ? q.confirmed : undefined,
      date_from: q.date_from?.match(/^\d{4}-\d{2}-\d{2}$/) ? q.date_from : undefined,
      date_to: q.date_to?.match(/^\d{4}-\d{2}-\d{2}$/) ? q.date_to : undefined,
      account: num(q.account),
      counterparty: num(q.counterparty),
      article: num(q.article),
      project: num(q.project),
      amount_min: num(q.amount_min),
      amount_max: num(q.amount_max),
      q: q.q,
    };
    await this.send(res, await this.exports.buildBuffer('operations', filters), this.exports.fileName('operations'));
  }

  /* ── Выгрузки по расписанию (ТЗ, п. 11, этап 2) ── */

  /** Список расписаний и готовых файлов; mailConfigured — настроен ли SMTP. */
  @Get('schedules')
  @Roles('admin', 'director')
  async schedules() {
    const [rows, files] = await Promise.all([
      this.prisma.scheduledExport.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
      this.prisma.exportFile.findMany({ where: { deletedAt: null }, orderBy: { id: 'desc' }, take: 30 }),
    ]);
    return {
      mailConfigured: this.schedule.mailConfigured(),
      kinds: EXPORT_KINDS.map((k) => ({ code: k, name: EXPORT_LABEL[k] })),
      frequencies: FREQUENCIES.map((f) => ({ code: f, name: FREQUENCY_LABEL[f] })),
      items: rows.map((s) => ({
        id: s.id,
        kind: s.kind,
        kindName: EXPORT_LABEL[s.kind as ExportKind] ?? s.kind,
        frequency: s.frequency,
        frequencyName: FREQUENCY_LABEL[s.frequency as keyof typeof FREQUENCY_LABEL] ?? s.frequency,
        hourUtc: s.hourUtc,
        email: s.email,
        enabled: s.enabled,
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
        nextRunAt: s.nextRunAt.toISOString(),
        lastError: s.lastError,
      })),
      files: files.map((f) => ({
        id: f.id,
        kind: f.kind,
        kindName: EXPORT_LABEL[f.kind as ExportKind] ?? f.kind,
        fileName: f.fileName,
        size: f.size,
        mailStatus: f.mailStatus,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  @Post('schedules')
  @HttpCode(201)
  @Roles('admin', 'director')
  async createSchedule(@Req() req: AuthRequest, @Body() dto: ScheduleDto) {
    const hourUtc = dto.hourUtc ?? 6;
    const row = await this.prisma.scheduledExport.create({
      data: {
        kind: dto.kind,
        frequency: dto.frequency,
        hourUtc,
        email: dto.email?.trim() || null,
        enabled: dto.enabled ?? true,
        nextRunAt: nextRun(dto.frequency, hourUtc),
        authorId: req.user!.sub,
      },
    });
    return { id: row.id, nextRunAt: row.nextRunAt.toISOString() };
  }

  @Patch('schedules/:id')
  @Roles('admin', 'director')
  async updateSchedule(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateScheduleDto) {
    const row = await this.prisma.scheduledExport.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new HttpException({ code: 'not_found', message: 'Расписание не найдено' }, HttpStatus.NOT_FOUND);
    const frequency = dto.frequency ?? row.frequency;
    const hourUtc = dto.hourUtc ?? row.hourUtc;
    const updated = await this.prisma.scheduledExport.update({
      where: { id },
      data: {
        frequency,
        hourUtc,
        ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        // Смена периодичности или часа сдвигает ближайший запуск
        ...(dto.frequency !== undefined || dto.hourUtc !== undefined
          ? { nextRunAt: nextRun(frequency, hourUtc) }
          : {}),
      },
    });
    return { id: updated.id, enabled: updated.enabled, nextRunAt: updated.nextRunAt.toISOString() };
  }

  @Delete('schedules/:id')
  @Roles('admin', 'director')
  async removeSchedule(@Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.scheduledExport.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new HttpException({ code: 'not_found', message: 'Расписание не найдено' }, HttpStatus.NOT_FOUND);
    await this.prisma.scheduledExport.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /** Выполнить расписание немедленно — «Сформировать сейчас». */
  @Post('schedules/:id/run')
  @HttpCode(200)
  @Roles('admin', 'director')
  async runSchedule(@Param('id', ParseIntPipe) id: number) {
    const file = await this.schedule.run(id);
    if (!file) {
      const row = await this.prisma.scheduledExport.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new HttpException({ code: 'not_found', message: 'Расписание не найдено' }, HttpStatus.NOT_FOUND);
      throw new HttpException(
        { code: 'export_failed', message: row.lastError ?? 'Не удалось сформировать выгрузку' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return { id: file.id, fileName: file.fileName, mailStatus: file.mailStatus };
  }

  /** Скачать готовый файл выгрузки. */
  @Get('files/:id')
  @Roles('admin', 'director')
  async downloadFile(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const f = await this.prisma.exportFile.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw new HttpException({ code: 'not_found', message: 'Файл выгрузки не найден' }, HttpStatus.NOT_FOUND);
    let body: Buffer;
    try {
      body = await this.storage.get(f.storageKey);
    } catch {
      throw new HttpException({ code: 'file_missing', message: 'Файл не найден в хранилище' }, HttpStatus.NOT_FOUND);
    }
    await this.send(res, body, f.fileName);
  }
}
