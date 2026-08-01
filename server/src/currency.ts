/** Валюта учёта.
 *
 *  Заказчик закрыл блокирующую развилку пакета в пользу варианта «одна валюта,
 *  без пересчёта»: все суммы в сомони, курсы не применяются. Это отменяет
 *  п. 1 и п. 8 ТЗ («справочно USD, EUR, RUB, CNY с курсом на дату операции»),
 *  и так и задумано — решения заказчика главнее ТЗ.
 *
 *  Структура БД при этом не тронута: колонки currency_code, rate, rate_date
 *  и amount_tjs_dirams остались на месте и заполняются TJS / 1 / сумма.
 *  Возврат к мультивалютности — это снятие флага ниже и возврат селектора
 *  валюты в формы, а не обратная миграция с восстановлением данных. */

export const BASE_CURRENCY = 'TJS';

/** Пока true — принимается только BASE_CURRENCY. */
export const SINGLE_CURRENCY = true;

/** Валюты, которые API готов принять. При включённом режиме — одна. */
export const ALLOWED_CURRENCIES: readonly string[] = SINGLE_CURRENCY
  ? [BASE_CURRENCY]
  : [BASE_CURRENCY, 'USD', 'EUR', 'RUB', 'CNY'];

/** Валюта запроса приемлема? Пустое значение = валюта по умолчанию. */
export function currencyAllowed(code: string | null | undefined): boolean {
  if (!code) return true;
  return ALLOWED_CURRENCIES.includes(code);
}

/** Текст ошибки 422 для отклонённой валюты.
 *  Подменять чужую валюту на сомони молча нельзя: сумма при этом остаётся
 *  прежней цифрой, и в отчёт попадает 1000 сомони вместо 1000 долларов. */
export const CURRENCY_DISABLED_MESSAGE =
  'Учёт ведётся в сомони (TJS) — операции в других валютах отключены';
