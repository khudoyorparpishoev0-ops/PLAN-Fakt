/** Периоды отчётности: переключатель «День / Неделя / Месяц / Квартал / Год»
 *  превращается в диапазон дат для API (?from=&to=).
 *
 *  Отчётный период по умолчанию — ГОД: демонстрационные данные системы лежат
 *  в октябре 2026, а новые записи создаются текущей датой; год покрывает и то,
 *  и другое. Заказчик может выбрать любой другой период — подпись в шапке
 *  показывает выбранный диапазон (решение зафиксировано в docs/CABINET_DIFF.md). */

export type PeriodKind = 'День' | 'Неделя' | 'Месяц' | 'Квартал' | 'Год' | 'Всё время';

export const PERIOD_KINDS: PeriodKind[] = ['День', 'Неделя', 'Месяц', 'Квартал', 'Год'];

export interface PeriodRange {
  from?: string; // YYYY-MM-DD
  to?: string;
  label: string; // подпись в шапке
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dmy = (d: Date) => `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`;

/** Диапазон дат и подпись для выбранного периода (относительно даты `now`). */
export function periodRange(kind: PeriodKind, now = new Date()): PeriodRange {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  const day = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd));

  switch (kind) {
    case 'День': {
      const t = day(y, m, d);
      return { from: iso(t), to: iso(t), label: `${dmy(t)} ${y}` };
    }
    case 'Неделя': {
      // Неделя с понедельника по воскресенье
      const shift = (day(y, m, d).getUTCDay() + 6) % 7;
      const from = day(y, m, d - shift), to = day(y, m, d - shift + 6);
      return { from: iso(from), to: iso(to), label: `${dmy(from)} — ${dmy(to)} ${to.getUTCFullYear()}` };
    }
    case 'Месяц': {
      const from = day(y, m, 1), to = day(y, m + 1, 0);
      return { from: iso(from), to: iso(to), label: `${MONTHS_NOM[m]} ${y}` };
    }
    case 'Квартал': {
      const q = Math.floor(m / 3);
      const from = day(y, q * 3, 1), to = day(y, q * 3 + 3, 0);
      return { from: iso(from), to: iso(to), label: `${q + 1} квартал ${y}` };
    }
    case 'Год': {
      const from = day(y, 0, 1), to = day(y, 11, 31);
      return { from: iso(from), to: iso(to), label: `${y} год` };
    }
    default:
      return { label: 'Всё время' };
  }
}

/** Период по умолчанию — год (см. пояснение в начале файла). */
export const DEFAULT_PERIOD: PeriodKind = 'Год';

/** Дата 'YYYY-MM-DD' попадает в период? (клиентская фильтрация списков) */
export function inRange(date: string | null | undefined, r: PeriodRange): boolean {
  if (!date) return true;
  if (r.from && date < r.from) return false;
  if (r.to && date > r.to) return false;
  return true;
}
