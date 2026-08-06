/** Валюта на стороне интерфейса — зеркало server/src/currency.ts.
 *
 *  06.08.2026 заказчик отменил решение 02 («одна валюта»): в формах снова
 *  выбор валюты, и список — все валюты мира (ISO 4217). Названия и точность
 *  берутся с сервера (GET /api/currencies), а не выписаны здесь: ICU знает
 *  их лучше, и держать второй список означало бы расхождение между формой
 *  и проверкой на сервере.
 *
 *  Валюта УЧЁТА по-прежнему одна — сомони: отчёты, план-факт и остатки
 *  считаются в TJS по курсу на дату операции.
 */

export const BASE_CURRENCY = 'TJS';

/** Мультивалютность включена (единая точка выключения, как на сервере). */
export const SINGLE_CURRENCY = false;

/** Строка справочника валют (GET /api/currencies). */
export interface CurrencyRow {
  code: string;
  name: string;
  /** Знаков после запятой: 0 у иены, 2 у сомони. */
  digits: number;
  /** Последний известный курс к сомони; null — курса нет. */
  rate: number | null;
  rateDate: string | null;
  /** Валюта уже в ходу у компании — идёт первой группой в списке. */
  used: boolean;
}

/** Пока справочник не загрузился, в селекте должна быть хотя бы база. */
export const FALLBACK_CURRENCIES: CurrencyRow[] = [
  { code: BASE_CURRENCY, name: 'Таджикский сомони', digits: 2, rate: 1, rateDate: null, used: true },
];

/** Сумма в формате валюты: «12 400,50», у иены — без копеек. */
export function fmtCur(value: number, digits = 2): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Точность валюты из справочника (по умолчанию две). */
export function digitsOf(list: CurrencyRow[], code: string): number {
  return list.find((c) => c.code === code)?.digits ?? 2;
}

/** Курс валюты к сомони из справочника; для базовой — единица. */
export function rateOf(list: CurrencyRow[], code: string): number | null {
  if (code === BASE_CURRENCY) return 1;
  return list.find((c) => c.code === code)?.rate ?? null;
}
