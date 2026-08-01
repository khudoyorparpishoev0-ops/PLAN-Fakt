import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage.service';
import { EXPORT_LABEL, ExportService, type ExportKind } from './export.service';

export const EXPORT_KINDS: ExportKind[] = ['report', 'projects', 'operations'];
export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type Frequency = typeof FREQUENCIES[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Ежедневно',
  weekly: 'Еженедельно (понедельник)',
  monthly: 'Ежемесячно (1-е число)',
};

/** Ближайший запуск после указанного момента: ежедневно / по понедельникам /
 *  первого числа, в заданный час UTC. */
export function nextRun(frequency: string, hourUtc: number, after = new Date()): Date {
  const h = Math.min(Math.max(hourUtc, 0), 23);
  const d = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), h, 0, 0));
  if (d <= after) d.setUTCDate(d.getUTCDate() + 1);
  if (frequency === 'weekly') {
    // 1 — понедельник
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  } else if (frequency === 'monthly') {
    while (d.getUTCDate() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Выгрузки по расписанию (ТЗ, п. 11, этап 2).
 *  Планировщик — простой таймер внутри приложения: раз в минуту берёт
 *  расписания, у которых подошёл срок, строит файл, кладёт в хранилище и,
 *  если настроен SMTP, отправляет письмом. */
@Injectable()
export class ExportScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Exports');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly exports: ExportService,
  ) {}

  onModuleInit() {
    if (process.env.EXPORT_SCHEDULER === 'off') {
      this.log.log('Планировщик выгрузок выключен (EXPORT_SCHEDULER=off)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Настроена ли отправка писем. */
  mailConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
  }

  /** Один проход планировщика: выполняет все просроченные расписания. */
  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.scheduledExport.findMany({
        where: { deletedAt: null, enabled: true, nextRunAt: { lte: now } },
        orderBy: { id: 'asc' },
        take: 20,
      });
      for (const s of due) await this.run(s.id, now);
      return due.length;
    } finally {
      this.running = false;
    }
  }

  /** Выполнить расписание сейчас: построить файл, сохранить, отправить. */
  async run(scheduleId: number, now = new Date()) {
    const s = await this.prisma.scheduledExport.findFirst({ where: { id: scheduleId, deletedAt: null } });
    if (!s) return null;
    const kind = s.kind as ExportKind;
    try {
      const buf = await this.exports.buildBuffer(kind);
      const stamp = now.toISOString().slice(0, 10);
      const base = this.exports.fileName(kind).replace('.xlsx', '');
      const fileName = `${base}-${stamp}.xlsx`;
      const key = this.storage.newKey(fileName);
      await this.storage.put(key, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      let mailStatus = 'skipped';
      if (s.email && this.mailConfigured()) {
        try {
          await this.sendMail(s.email, fileName, buf, kind);
          mailStatus = 'sent';
        } catch (e) {
          mailStatus = 'error';
          this.log.warn(`Письмо не отправлено (${s.email}): ${(e as Error).message}`);
        }
      }

      const file = await this.prisma.exportFile.create({
        data: { scheduleId: s.id, kind, fileName, storageKey: key, size: buf.length, mailStatus },
      });
      await this.prisma.scheduledExport.update({
        where: { id: s.id },
        data: { lastRunAt: now, nextRunAt: nextRun(s.frequency, s.hourUtc, now), lastError: null },
      });
      this.log.log(`Выгрузка «${EXPORT_LABEL[kind]}» готова: ${fileName} (${mailStatus})`);
      return file;
    } catch (e) {
      const message = (e as Error).message.slice(0, 400);
      await this.prisma.scheduledExport.update({
        where: { id: s.id },
        data: { lastRunAt: now, nextRunAt: nextRun(s.frequency, s.hourUtc, now), lastError: message },
      });
      this.log.error(`Выгрузка не удалась: ${message}`);
      return null;
    }
  }

  private async sendMail(to: string, fileName: string, content: Buffer, kind: ExportKind) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      ...(process.env.SMTP_USER
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } }
        : {}),
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `IT-HONA · ${EXPORT_LABEL[kind]} — ${fileName}`,
      text: `Во вложении регулярная выгрузка «${EXPORT_LABEL[kind]}» из системы «Финансы: План-Факт».`,
      attachments: [{ filename: fileName, content }],
    });
  }
}
