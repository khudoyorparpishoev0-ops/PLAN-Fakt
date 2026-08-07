import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './http-exception.filter';

/** Конфигурация — только из переменных окружения (см. .env.example). */
async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.error('JWT_SECRET не задан — в production запуск запрещён.');
    process.exit(1);
  }
  const app = await NestFactory.create(AppModule);

  /* Заголовки безопасности на каждый ответ API.
   *
   * Аудит 07.08.2026: API не отдавал ни одного из них. Отдельная библиотека
   * (helmet) ради пяти строк не нужна — здесь только то, что имеет смысл для
   * JSON-ответов: запрет угадывать тип содержимого, запрет вставлять ответ в
   * чужой фрейм и молчание реферера. Заголовки статики — в nginx.
   */
  // Express хвастается собой в каждом ответе — версия сервера чужому глазу
  // ничего не даёт, кроме подсказки, чем именно нас атаковать
  (app.getHttpAdapter().getInstance() as { disable: (k: string) => void }).disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Ошибки валидации входных данных — HTTP 422 в едином формате
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API запущен: http://0.0.0.0:${port}/api (TZ=${process.env.TZ ?? 'не задан'})`);
}

bootstrap();
