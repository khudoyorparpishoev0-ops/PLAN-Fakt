import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';

/** Файловое хранилище вложений (ТЗ, п. 10: объектное хранилище).
 *
 *  Драйвер выбирается по окружению:
 *  - задан S3_ENDPOINT → MinIO/S3 (доступы: S3_ACCESS_KEY/S3_SECRET_KEY или
 *    MINIO_ROOT_USER/MINIO_ROOT_PASSWORD, бакет S3_BUCKET/MINIO_BUCKET,
 *    создаётся при старте);
 *  - иначе → локальный каталог STORAGE_DIR (по умолчанию ./data/attachments) —
 *    запасной вариант для сред без MinIO (локальная разработка).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private s3: S3Client | null = null;
  private bucket = '';
  private fsDir = '';

  get driver(): 's3' | 'fs' {
    return this.s3 ? 's3' : 'fs';
  }

  constructor() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    if (endpoint) {
      this.bucket = process.env.S3_BUCKET?.trim() || process.env.MINIO_BUCKET?.trim() || 'ithona-attachments';
      this.s3 = new S3Client({
        endpoint,
        region: process.env.S3_REGION?.trim() || 'us-east-1',
        forcePathStyle: true, // MinIO — path-style адресация
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY?.trim() || process.env.MINIO_ROOT_USER?.trim() || '',
          secretAccessKey: process.env.S3_SECRET_KEY?.trim() || process.env.MINIO_ROOT_PASSWORD?.trim() || '',
        },
      });
    } else {
      this.fsDir = resolve(process.env.STORAGE_DIR?.trim() || './data/attachments');
    }
  }

  async onModuleInit() {
    if (this.s3) {
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        try {
          await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Создан бакет ${this.bucket}`);
        } catch (e) {
          this.logger.error(`Бакет ${this.bucket} недоступен: ${e instanceof Error ? e.message : e}`);
        }
      }
      this.logger.log(`Хранилище вложений: S3 (${process.env.S3_ENDPOINT}, бакет ${this.bucket})`);
    } else {
      await mkdir(this.fsDir, { recursive: true });
      this.logger.log(`Хранилище вложений: локальный каталог ${this.fsDir}`);
    }
  }

  /** Новый ключ хранения: attachments/<год>/<случайное>.<расширение>. */
  newKey(fileName: string): string {
    const ext = (fileName.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? 'bin').toLowerCase();
    return `attachments/${new Date().getUTCFullYear()}/${randomBytes(12).toString('hex')}.${ext}`;
  }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }));
      return;
    }
    const path = join(this.fsDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    }
    return readFile(join(this.fsDir, key));
  }
}
