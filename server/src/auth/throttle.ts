import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** Ограничение перебора пароля.
 *
 *  Найдено аудитом 07.08.2026: двадцать пять подряд неверных паролей к
 *  admin@it-hona.tj отрабатывали за пару секунд и все двадцать пять раз
 *  отвечали 401. Для системы, где под одной учётной записью лежат все деньги
 *  компании, это подарок: словарь на сто тысяч слов перебирается за час.
 *
 *  Счётчик — в памяти процесса: приложение одно, база под перебор не нужна,
 *  а лишняя таблица означала бы запись в БД на каждую неудачную попытку.
 *  При перезапуске счётчики обнуляются — это осознанный размен: защита от
 *  автоматического перебора, а не от целенаправленной осады.
 *
 *  Ключ — пара «IP + логин»: блокировать только по IP нельзя (вся контора
 *  выходит через один адрес), только по логину — тоже (тогда чужой человек
 *  может заблокировать вход директору).
 */

/** Сколько неудач подряд допускается до паузы. */
const MAX_FAILS = 8;
/** Пауза после превышения. */
const LOCK_MS = 5 * 60 * 1000;
/** Через сколько тишины счётчик неудач забывается. */
const RESET_MS = 15 * 60 * 1000;
/** Предохранитель от разрастания памяти при переборе логинов. */
const MAX_KEYS = 5000;

interface Attempt {
  fails: number;
  /** Время последней неудачи. */
  last: number;
  /** До какого момента вход заблокирован. */
  until: number;
}

const attempts = new Map<string, Attempt>();

const now = () => Date.now();

function prune() {
  if (attempts.size <= MAX_KEYS) return;
  const t = now();
  for (const [k, v] of attempts) if (v.until < t && t - v.last > RESET_MS) attempts.delete(k);
  // Если после уборки всё равно тесно — старые записи уходят первыми
  if (attempts.size > MAX_KEYS) {
    const oldest = [...attempts.entries()].sort((a, b) => a[1].last - b[1].last).slice(0, attempts.size - MAX_KEYS);
    for (const [k] of oldest) attempts.delete(k);
  }
}

export function throttleKey(req: Request): string {
  // Берём ПОСЛЕДНИЙ адрес в X-Forwarded-For: nginx дописывает реальный адрес
  // клиента в конец, а начало заголовка подделывается самим клиентом
  const chain = (req.headers['x-forwarded-for'] as string | undefined)?.split(',') ?? [];
  const ip = chain[chain.length - 1]?.trim() || req.ip || 'unknown';
  const body = req.body as { email?: string } | undefined;
  const login = String(body?.email ?? '').toLowerCase().trim();
  return `${ip}|${login}`;
}

/** Осталось секунд до конца паузы; 0 — не заблокирован. */
export function lockedFor(key: string): number {
  const a = attempts.get(key);
  if (!a) return 0;
  const left = a.until - now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Отметить неудачную попытку входа. */
export function registerFailure(key: string): void {
  const t = now();
  const a = attempts.get(key);
  if (!a || t - a.last > RESET_MS) {
    attempts.set(key, { fails: 1, last: t, until: 0 });
  } else {
    a.fails += 1;
    a.last = t;
    if (a.fails >= MAX_FAILS) {
      a.until = t + LOCK_MS;
      a.fails = 0; // после паузы даём новый круг, а не мгновенную блокировку
    }
  }
  prune();
}

/** Успешный вход обнуляет счётчик. */
export function registerSuccess(key: string): void {
  attempts.delete(key);
}

/** Только для проверок: полностью очистить счётчики. */
export function resetThrottle(): void {
  attempts.clear();
}

/** Гвард на вход: 429 с Retry-After, пока идёт пауза. */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const left = lockedFor(throttleKey(req));
    if (left > 0) {
      ctx.switchToHttp().getResponse().setHeader('Retry-After', String(left));
      throw new HttpException(
        {
          code: 'too_many_attempts',
          message: `Слишком много неудачных попыток входа. Повторите через ${Math.ceil(left / 60)} мин.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
