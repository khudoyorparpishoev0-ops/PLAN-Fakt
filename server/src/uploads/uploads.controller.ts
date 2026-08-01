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
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new HttpException(
        { code: 'unsupported_file_type', message: 'Допустимы только JPG, PNG и PDF', field: 'file' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    // Имя приходит из multipart в latin1 — восстанавливаем UTF-8 (кириллица)
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const key = this.storage.newKey(fileName);
    await this.storage.put(key, file.buffer, file.mimetype);
    return { key, fileName, mime: file.mimetype, size: file.size };
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

  /** Открепить вложение операции (файл в хранилище остаётся). */
  @Delete('attachments/:id')
  @Roles('admin', 'director')
  async removeAttachment(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    const att = await this.prisma.attachment.findFirst({ where: { id, deletedAt: null } });
    if (!att) throw new HttpException({ code: 'not_found', message: 'Вложение не найдено' }, HttpStatus.NOT_FOUND);
    if (att.operationId == null) {
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
