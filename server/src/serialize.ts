/** Сериализация БД → JSON: деньги из дирамов (BigInt) в сомони (number),
 *  даты @db.Date — в строку YYYY-MM-DD. JSON.stringify не умеет BigInt,
 *  поэтому все суммы конвертируются явно на границе API. */

/** Дирамы (BigInt) → сомони (число, 2 знака). */
export function somoni(dirams: bigint | null | undefined): number | null {
  if (dirams === null || dirams === undefined) return null;
  return Number(dirams) / 100;
}

/** Дата (@db.Date, UTC-полночь) → 'YYYY-MM-DD'. */
export function dateStr(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
