/** Справочник валют мира — ISO 4217, действующие коды.
 *
 *  Заказчик 06.08.2026 отменил решение 02 («одна валюта, TJS»): учёт снова
 *  мультивалютный, и список — не пять валют закупок, а все валюты мира.
 *
 *  Названия и число знаков после запятой НЕ выписаны руками: их даёт ICU,
 *  встроенный в Node и в браузер (Intl.DisplayNames / Intl.NumberFormat).
 *  Сто семьдесят названий, набранных вручную, — это сто семьдесят возможных
 *  опечаток в интерфейсе; ICU же знает и «японская иена» без копеек, и
 *  «кувейтский динар» с тремя знаками. Здесь остаётся только список кодов.
 *
 *  В список входят валюты обращения. Расчётные единицы и металлы
 *  (XDR, XAU, XAG, XPT, XPD), тестовый XTS и «нет валюты» XXX исключены:
 *  платёж в них невозможен, а в селекте они только мешают.
 */

export const ISO_CURRENCY_CODES: readonly string[] = [
  // СНГ и соседи
  'TJS', 'RUB', 'KZT', 'UZS', 'KGS', 'TMT', 'AZN', 'AMD', 'GEL', 'BYN', 'UAH', 'MDL',
  // Резервные и основные торговые
  'USD', 'EUR', 'CNY', 'GBP', 'CHF', 'JPY', 'TRY', 'AED', 'INR',
  // Европа
  'ALL', 'BAM', 'BGN', 'CZK', 'DKK', 'GIP', 'HUF', 'ISK', 'MKD', 'NOK', 'PLN', 'RON',
  'RSD', 'SEK',
  // Ближний Восток
  'BHD', 'ILS', 'IQD', 'IRR', 'JOD', 'KWD', 'LBP', 'OMR', 'QAR', 'SAR', 'SYP', 'YER',
  // Южная и Юго-Восточная Азия
  'AFN', 'BDT', 'BND', 'BTN', 'IDR', 'KHR', 'LAK', 'LKR', 'MMK', 'MNT', 'MVR', 'MYR',
  'NPR', 'PHP', 'PKR', 'SGD', 'THB', 'VND',
  // Восточная Азия
  'HKD', 'KPW', 'KRW', 'MOP', 'TWD',
  // Океания
  'AUD', 'FJD', 'NZD', 'PGK', 'SBD', 'TOP', 'VUV', 'WST', 'XPF',
  // Северная Америка и Карибы
  'CAD', 'MXN', 'AWG', 'ANG', 'BBD', 'BMD', 'BSD', 'BZD', 'CUP', 'DOP', 'HTG', 'JMD',
  'KYD', 'TTD', 'XCD', 'XCG',
  // Центральная Америка
  'CRC', 'GTQ', 'HNL', 'NIO', 'PAB', 'SVC',
  // Южная Америка
  'ARS', 'BOB', 'BRL', 'CLP', 'COP', 'FKP', 'GYD', 'PEN', 'PYG', 'SRD', 'UYU', 'VES',
  // Северная Африка
  'DZD', 'EGP', 'LYD', 'MAD', 'SDG', 'TND',
  // Западная Африка
  'CVE', 'GHS', 'GMD', 'GNF', 'LRD', 'MRU', 'NGN', 'SLE', 'STN', 'XOF',
  // Центральная и Восточная Африка
  'BIF', 'CDF', 'DJF', 'ERN', 'ETB', 'KES', 'RWF', 'SOS', 'SSP', 'TZS', 'UGX', 'XAF',
  // Южная Африка и острова
  'AOA', 'BWP', 'KMF', 'LSL', 'MGA', 'MUR', 'MWK', 'MZN', 'NAD', 'SCR', 'SHP', 'SZL',
  'ZAR', 'ZMW', 'ZWG',
];

const CODES = new Set(ISO_CURRENCY_CODES);

/** Код есть в справочнике? Регистр приводим — «usd» из формы это тот же USD. */
export function isIsoCurrency(code: string | null | undefined): boolean {
  return !!code && CODES.has(code.toUpperCase());
}

/** Ленивый ICU: один экземпляр на процесс, промах не роняет запрос. */
let displayNames: Intl.DisplayNames | null | undefined;
function names(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['ru'], { type: 'currency' });
    } catch {
      displayNames = null; // сборка Node без полного ICU — покажем код
    }
  }
  return displayNames;
}

/** Название валюты по-русски: «доллар США» → «Доллар США». */
export function currencyName(code: string): string {
  const upper = code.toUpperCase();
  const raw = names()?.of(upper);
  if (!raw || raw === upper) return upper;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Знаков после запятой у валюты: 0 у иены, 2 у сомони, 3 у динара. */
export function currencyDigits(code: string): number {
  try {
    const opts = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: code.toUpperCase() })
      .resolvedOptions();
    return opts.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Сумма, приведённая к точности валюты.
 *
 *  У иены и вона копеек нет — «1000,5 JPY» это ошибка ввода, а не сумма.
 *  Больше двух знаков не храним: шкала суммы в базе фиксированная (дирамы,
 *  ×100), поэтому третий знак у динаров (KWD, BHD, OMR, JOD, LYD, TND)
 *  округляется до сотых. Для расчётов компании это доли тийина, но знать
 *  об ограничении надо — оно записано в docs/PLAN_UPDATE.md.
 */
export function roundToCurrency(amount: number, code: string): number {
  const digits = Math.min(currencyDigits(code), 2);
  const factor = 10 ** digits;
  return Math.round(amount * factor) / factor;
}

export interface CurrencyMeta {
  code: string;
  name: string;
  digits: number;
}

/** Весь справочник для API и сида — по алфавиту названий. */
export function currencyList(): CurrencyMeta[] {
  return ISO_CURRENCY_CODES
    .map((code) => ({ code, name: currencyName(code), digits: currencyDigits(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
