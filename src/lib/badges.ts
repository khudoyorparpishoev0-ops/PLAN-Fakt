import { C, type BadgeColor } from '../theme';
import { pct1, sgn } from './format';

export interface BadgeData { t: string; fg: string; bg: string; dot: string }

export function badge(t: string, c: BadgeColor): BadgeData {
  return { t, fg: C[c].fg, bg: C[c].bg, dot: C[c].dot };
}

/** Бейдж статуса операции (доход/расход/заявка). */
export function opBadge(st: string): BadgeData {
  const g = ['Получен', 'Оплачено', 'Согласовано'],
    y = ['Частично получен', 'Частично оплачено', 'На согласовании'],
    r = ['Просрочен', 'Просрочено', 'Отклонено'];
  if (g.includes(st)) return badge(st, 'green');
  if (y.includes(st)) return badge(st, 'yellow');
  if (r.includes(st)) return badge(st, 'red');
  return badge(st, 'gray');
}

/* ── Статусы План-Факта: одна формула на всю систему ──────────────────────
 *
 * Шкала — из макета «IT-HONA План-Факт» (решение заказчика 02.08.2026,
 * выбрано вместо таблицы ТЗ п. 8, с которой макет расходился). Пороги
 * настраиваемые: приходят из GET /settings, по умолчанию — значения макета.
 * Зеркало серверной server/src/pf.ts — правьте оба файла. */

export interface PfThresholds {
  /** ±норма: до этого отклонение «В норме» (по умолчанию 2%). */
  norm: number;
  /** Против плана больше этого — «Критично», до — «Внимание» (10%). */
  warn: number;
  /** В свою пользу больше этого — «Проверить план» (25%). */
  check: number;
}
export const PF_DEFAULTS: PfThresholds = { norm: 2, warn: 10, check: 25 };

export type PfDir = 'income' | 'expense';

/** Статус строки план-факта. fact === null — факт не проведён. */
export function pfStatus(plan: number, fact: number | null, dir: PfDir, th: PfThresholds = PF_DEFAULTS): BadgeData {
  if (fact === null) return badge('Нет данных', 'gray');
  if (!plan) return badge('План не указан', 'gray');
  const dev = fact - plan;
  // Знаменатель по модулю: у строки результата план бывает отрицательным.
  const pct = Math.abs(dev / plan) * 100;
  if (pct <= th.norm) return badge('В норме', 'gray');
  const good = dir === 'income' ? dev > 0 : dev < 0;
  if (good) {
    if (pct > th.check) return badge('Проверить план', 'orange');
    return badge(dir === 'income' ? 'Выше плана' : 'Экономия', 'green');
  }
  return pct > th.warn ? badge('Критично', 'red') : badge('Внимание', 'yellow');
}

/** Правила легенды «Как считается статус» — из тех же порогов, что формула:
 *  легенда не может разойтись с поведением. */
export function pfLegend(th: PfThresholds): Array<{ label: string; rule: string; color: BadgeColor }> {
  const p = (v: number) => String(v).replace('.', ',') + '%';
  return [
    { label: 'В норме', rule: `±${p(th.norm)}`, color: 'gray' },
    { label: 'Экономия / выше плана', rule: `в свою пользу ${p(th.norm)}–${p(th.check)}`, color: 'green' },
    { label: 'Внимание', rule: `против плана ${p(th.norm)}–${p(th.warn)}`, color: 'yellow' },
    { label: 'Критично', rule: `против плана больше ${p(th.warn)}`, color: 'red' },
    { label: 'Проверить план', rule: `в свою пользу больше ${p(th.check)}`, color: 'orange' },
    { label: 'Нет данных', rule: 'факт не проведён', color: 'gray' },
  ];
}

/** Бейдж отклонения по доходам. */
export function incDevB(plan: number, fact: number, pending?: boolean, th?: PfThresholds): BadgeData {
  return pfStatus(plan, pending && !fact ? null : fact, 'income', th);
}

/** Бейдж отклонения по расходам. */
export function expDevB(plan: number, fact: number, pending?: boolean, th?: PfThresholds): BadgeData {
  return pfStatus(plan, pending && !fact ? null : fact, 'expense', th);
}

/** Бейдж результата (доходы − расходы): больше — лучше, как у дохода.
 *  Убыток при плановой прибыли — всегда «Убыток», какой бы ни был процент. */
export function profDevB(plan: number, fact: number, th?: PfThresholds): BadgeData {
  if (plan > 0 && fact < 0) return badge('Убыток', 'red');
  return pfStatus(plan, fact, 'income', th);
}

export interface DevInfo { devF: string; devPctF: string; devFg: string }

/** Отклонение факт−план: форматированные значение, процент и цвет. */
export function devInfo(type: 'inc' | 'exp', plan: number, fact: number, pending?: boolean): DevInfo {
  if (!plan || (pending && !fact)) return { devF: '—', devPctF: '—', devFg: 'var(--fin-text-5)' };
  const d = fact - plan, p = (d / plan) * 100;
  let fg = 'var(--fin-text-3)';
  if (d !== 0) fg = (type === 'inc' ? d > 0 : d < 0) ? 'var(--fin-plus)' : 'var(--fin-minus)';
  return { devF: sgn(d), devPctF: (d > 0 ? '+' : d < 0 ? '−' : '') + pct1(Math.abs(p)) + '%', devFg: fg };
}
