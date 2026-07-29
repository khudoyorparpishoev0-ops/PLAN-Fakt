import type { Expense, Income } from '../data/admin';
import { devInfo, opBadge, type BadgeData, type DevInfo } from './badges';
import { fmt } from './format';

export type ExpRow = Expense & DevInfo & { planF: string; factF: string; b: BadgeData };
export type IncRow = Income & DevInfo & { planF: string; factF: string; b: BadgeData };

/** Строка расхода с форматированными значениями и бейджем. */
export const expRow = (r: Expense): ExpRow => ({
  ...r,
  planF: fmt(r.plan),
  factF: r.fact ? fmt(r.fact) : '—',
  b: opBadge(r.status),
  ...devInfo('exp', r.plan, r.fact, r.pending),
});

/** Строка дохода с форматированными значениями и бейджем. */
export const incRow = (r: Income): IncRow => ({
  ...r,
  planF: fmt(r.plan),
  factF: r.fact ? fmt(r.fact) : '—',
  b: opBadge(r.status),
  ...devInfo('inc', r.plan, r.fact, r.pending),
});
