import {
  Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Param, ParseIntPipe, Post, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage.service';

/** Допустимые вложения (ТЗ, п. 10): JPG/PNG/PDF до 10 МБ. */
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);

/** Настоящий тип файла — по первым байтам, а не по слову клиента.
 *
 *  Аудит 07.08.2026: тип брался из multipart-заголовка, который присылает
 *  браузер (или кто угодно). Достаточно было отправить .exe с подписью
 *  «application/pdf», и файл ложился в хранилище как «счёт». Подпись файла
 *  подделать нельзя, не сделав файл настоящим PDF или картинкой.
 */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

/** Распознанный тип содержимого либо null. */
function sniffMime(buf: Buffer): string | null {
  return SIGNATURES.find((s) => buf.length >= 8 && s.test(buf))?.mime ?? null;
}

/** Тело запроса «прикрепить файл к операции». */
export class AttachToOperationDto {
  @IsString()
  @Length(3, 300)
  key!: string;

  @IsString()
  @Length(1, 300, { message: 'Не передано имя файла' })
  fileName!: string;

  @IsOptional() @IsIn(['doc', 'photo', 'receipt']) kind?: string;
  @IsOptional() @IsString() @Length(0, 100) mime?: string;
  @IsOptional() @IsInt() size?: number;
}

/** Загрузка и выдача вложений заявок и операций. Файл сначала загружается
 *  (POST /api/uploads → ключ), затем ключ передаётся в POST /api/requests —
 *  как в эскизе API ТЗ (attachments: ["file_8f2a"]). */
@Controller()
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class UploadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Post('uploads')
  @Roles('accountant', 'director', 'admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new HttpException(
        { code: 'validation', message: 'Файл не передан (поле file, multipart/form-data)', field: 'file' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    // Заголовок клиента — лишь заявка о намерениях; решает подпись файла
    const sniffed = sniffMime(file.buffer);
    if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
      throw new HttpException(
        {
          code: 'unsupported_file_type',
          message: 'Допустимы только JPG, PNG и PDF — файл не похож ни на один из них',
          field: 'file',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    // Имя приходит из multipart в latin1 — восстанавливаем UTF-8 (кириллица)
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const key = this.storage.newKey(fileName);
    // В хранилище кладём распознанный тип: иначе отдача файла подтвердит
    // клиенту его же выдумку про Content-Type
    await this.storage.put(key, file.buffer, sniffed);
    return { key, fileName, mime: sniffed, size: file.size };
  }

  /** Прикрепить загруженный файл к операции журнала (ТЗ, п. 10). */
  @Post('operations/:id/attachments')
  @HttpCode(201)
  @Roles('admin', 'director')
  async attachToOperation(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachToOperationDto,
  ) {
    const op = await this.prisma.operation.findFirst({ where: { id, deletedAt: null } });
    if (!op) throw new HttpException({ code: 'not_found', message: 'Операция не найдена' }, HttpStatus.NOT_FOUND);
    const fileName = dto.fileName.trim();
    const exists = await this.prisma.attachment.findFirst({
      where: { operationId: id, fileName },
    });
    if (exists && exists.deletedAt === null) {
      throw new HttpException(
        { code: 'file_exists', message: 'Файл с таким именем уже прикреплён к операции', field: 'fileName' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const data = {
      operationId: id,
      kind: dto.kind ?? 'doc',
      fileName,
      storageKey: dto.key,
      mime: dto.mime ?? null,
      size: dto.size ?? null,
      uploadedById: req.user!.sub,
      deletedAt: null,
    };
    const att = exists
      ? await this.prisma.attachment.update({ where: { id: exists.id }, data })
      : await this.prisma.attachment.create({ data });
    await this.prisma.auditLog.create({
      data: { userId: req.user!.sub, entity: 'operation', entityId: String(id), action: 'attach', newValue: { fileName } },
    });
    return { id: att.id, fileName: att.fileName, mime: att.mime, size: att.size };
  }

  /** Прикрепить файл к сделке закупки: договоры и накладные.
   *  Блок «Файлы и комментарии» из эталонного прототипа. */
  @Post('deals/:id/attachments')
  @HttpCode(201)
  @Roles('admin', 'director')
  async attachToDeal(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachToOperationDto,
  ) {
    const deal = await this.prisma.deal.findFirst({ where: { id, deletedAt: null } });
    if (!deal) throw new HttpException({ code: 'not_found', message: 'Сделка не найдена' }, HttpStatus.NOT_FOUND);
    const fileName = dto.fileName.trim();
    const exists = await this.prisma.attachment.findFirst({ where: { dealId: id, fileName } });
    if (exists && exists.deletedAt === null) {
      throw new HttpException(
        { code: 'file_exists', message: 'Файл с таким именем уже прикреплён к сделке', field: 'fileName' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const data = {
      dealId: id,
      kind: dto.kind ?? 'doc',
      fileName,
      storageKey: dto.key,
      mime: dto.mime ?? null,
      size: dto.size ?? null,
      uploadedById: req.user!.sub,
      deletedAt: null,
    };
    const att = exists
      ? await this.prisma.attachment.update({ where: { id: exists.id }, data })
      : await this.prisma.attachment.create({ data });
    await this.prisma.auditLog.create({
      data: { userId: req.user!.sub, entity: 'deal', entityId: String(id), action: 'attach', newValue: { fileName } },
    });
    return { id: att.id, fileName: att.fileName, mime: att.mime, size: att.size };
  }

  /** Открепить вложение операции (файл в хранилище остаётся). */
  @Delete('attachments/:id')
  @Roles('admin', 'director')
  async removeAttachment(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    const att = await this.prisma.attachment.findFirst({ where: { id, deletedAt: null } });
    if (!att) throw new HttpException({ code: 'not_found', message: 'Вложение не найдено' }, HttpStatus.NOT_FOUND);
    if (att.operationId == null && att.dealId == null) {
      throw new HttpException(
        { code: 'request_attachment', message: 'Вложение заявки удаляется вместе с заявкой' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    await this.prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user!.sub, entity: 'operation', entityId: String(att.operationId),
        action: 'detach', newValue: { fileName: att.fileName },
      },
    });
    return { id, deleted: true };
  }

  /** Скачивание вложения. Бухгалтер — только файлы своих заявок; вложения
   *  операций журнала бухгалтеру недоступны, как и сам журнал. */
  @Get('attachments/:id')
  @Roles('accountant', 'director', 'admin')
  async download(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const att = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      include: { request: true },
    });
    const own =
      att &&
      (req.user!.role !== 'accountant' ||
        (att.request != null && att.request.authorId === req.user!.sub));
    if (!att || !own) {
      throw new HttpException({ code: 'not_found', message: 'Вложение не найдено' }, HttpStatus.NOT_FOUND);
    }
    if (!att.storageKey) {
      // Записи из seed — имена-заглушки без файла
      throw new HttpException(
        { code: 'no_file', message: 'Файл не загружался (демо-данные)' },
        HttpStatus.NOT_FOUND,
      );
    }
    let body: Buffer;
    try {
      body = await this.storage.get(att.storageKey);
    } catch {
      // Ключ есть, а файла в хранилище нет (сменили STORAGE_DIR/бакет) —
      // отвечаем понятной ошибкой вместо 500
      throw new HttpException(
        { code: 'file_missing', message: 'Файл не найден в хранилище' },
        HttpStatus.NOT_FOUND,
      );
    }
    res.setHeader('Content-Type', att.mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.send(body);
  }
}
