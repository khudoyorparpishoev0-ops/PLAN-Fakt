import {
  Controller, Get, HttpException, HttpStatus, Param, ParseIntPipe, Post, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage.service';

/** Допустимые вложения (ТЗ, п. 10): JPG/PNG/PDF до 10 МБ. */
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);

/** Загрузка и выдача вложений заявок. Файл сначала загружается
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
  @Roles('accountant')
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

  /** Скачивание вложения. Бухгалтер — только файлы своих заявок. */
  @Get('attachments/:id')
  @Roles('accountant', 'director', 'admin')
  async download(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const att = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      include: { request: true },
    });
    const own = att && (req.user!.role !== 'accountant' || att.request.authorId === req.user!.sub);
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
    const body = await this.storage.get(att.storageKey);
    res.setHeader('Content-Type', att.mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.send(body);
  }
}
