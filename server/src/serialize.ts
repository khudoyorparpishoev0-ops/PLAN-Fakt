/** Сериализация БД → JSON: деньги из дирамов (BigInt) в сомони (number),
 *  даты @db.Date — в строку YYYY-MM-DD. JSON.stringify не умеет BigInt,
 *  поэтому все суммы конвертируются явно на границе API. */

/** Дирамы (BigInt) → сомони (число, 2 знака). */
export function somoni(dirams: bigint | null | undefined): number | null {
  if (dirams === null || dirams === undefined) return null;
  return Number(dirams) / 100;
}

/** Предел точности денег.
 *
 *  В базе суммы — целые дирамы (BigInt), но на границе API они становятся
 *  обычным JSON-числом, а это double: точным остаётся только целое до
 *  2^53−1. Выше этого числа «одобрено 90 071 992 547 409,93» вернётся из
 *  API другой цифрой, и никто этого не заметит. Поэтому суммы за пределом
 *  не принимаются: 90 071 992 547 409,91 сомони — это не бухгалтерия, это
 *  промах по клавише.
 */
export const MAX_MONEY_DIRAMS = BigInt(Number.MAX_SAFE_INTEGER); // 9 007 199 254 740 991
export const MAX_MONEY_TJS = Number(MAX_MONEY_DIRAMS) / 100;

/** Сумма в сомони помещается в точную шкалу дирамов? */
export function moneyFits(amountTjs: number): boolean {
  return Number.isFinite(amountTjs) && Math.abs(amountTjs) * 100 <= Number(MAX_MONEY_DIRAMS);
}

export const MONEY_TOO_BIG_MESSAGE =
  `Сумма слишком велика: максимум ${MAX_MONEY_TJS.toLocaleString('ru-RU')} — проверьте, не лишний ли разряд`;

/** Дата (@db.Date, UTC-полночь) → 'YYYY-MM-DD'. */
export function dateStr(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
