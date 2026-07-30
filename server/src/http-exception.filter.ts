import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

/** Единый формат ошибок API (ТЗ, раздел 9):
 *  { "error": { "code", "message", "field?" } } с HTTP 400/403/404/422/… */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    // Непредвиденные ошибки (не HttpException) — в лог сервера, клиенту детали не отдаются
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let message = 'Внутренняя ошибка сервера';
    let field: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // Ответ ValidationPipe: { message: string[] | string, error: string }
        const rawMessage = Array.isArray(b.message) ? b.message[0] : b.message;
        message = typeof rawMessage === 'string' ? rawMessage : exception.message;
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.field === 'string') field = b.field;
      }
      if (code === 'internal_error') {
        code =
          status === HttpStatus.BAD_REQUEST ? 'bad_request'
          : status === HttpStatus.UNAUTHORIZED ? 'unauthorized'
          : status === HttpStatus.FORBIDDEN ? 'forbidden'
          : status === HttpStatus.NOT_FOUND ? 'not_found'
          : status === HttpStatus.UNPROCESSABLE_ENTITY ? 'validation_error'
          : status === HttpStatus.SERVICE_UNAVAILABLE ? 'service_unavailable'
          : 'error';
      }
    }

    res.status(status).json({ error: { code, message, ...(field ? { field } : {}) } });
  }
}
