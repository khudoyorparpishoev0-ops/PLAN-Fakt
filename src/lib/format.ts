/** Форматирование чисел и дат — 1:1 из прототипа. */

/** 1234567 → «1 234 567» (неразрывные пробелы локали ru-RU). */
export function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

/** Знаковое число: 0 → «0», 25000 → «+25 000», −4500 → «−4 500» (минус U+2212). */
export function sgn(n: number): string {
  return n === 0 ? '0' : (n > 0 ? '+' : '−') + Math.abs(n).toLocaleString('ru-RU');
}

/** Процент с одним знаком после запятой: 92.35 → «92,4». */
export function pct1(x: number): string {
  return x.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** ISO-дата → «01 фев ’26»; null → «—». */
export function fmtD(iso: string | null | undefined): string {
  if (!iso) return '—';
  const M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const p = iso.split('-');
  return p[2] + ' ' + M[+p[1] - 1] + ' ’' + p[0].slice(2);
}

/** Склонение: 7 → «7 проектов». */
export function plural(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  return n + ' ' + (m10 === 1 && m100 !== 11 ? 'проект' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'проекта' : 'проектов');
}
