import type { Expense, Income } from '../data/admin';
import type { ApiMetrics as Metrics } from './api';
import { fmt, pct1, sgn } from './format';
import { badge, profDevB, type BadgeData } from './badges';

/** Сквозные агрегаты «план–факт» по доходам/расходам/прибыли + константы панели. */
export interface Totals {
  incPlan: number; incFact: number; expPlan: number; expFact: number;
  incPct: number; expPct: number; profPlan: number; profFact: number;
  incB: BadgeData; expB: BadgeData; profB: BadgeData;
  incPlanF: string; incFactF: string; incPctT: string; incPctW: string;
  incDevF: string; incForeF: string; incRestF: string;
  expPlanF: string; expFactF: string; expPctT: string; expPctW: string;
  expOverF: string; expSaveF: string;
  profPlanF: string; profFactF: string; profDevF: string;
  rentT: string; prevT: string; profPctT: string; profPctW: string;
  cashBox: string; cashBank: string; cashTotal: string; cashIn: string; cashOut: string;
  cashOutAbs: string; cashFree: string; cashGap: boolean;
  debR: string; debROver: string; credit: string; creditOver: string;
}

/** Бейдж выполнения плана доходов для KPI-карточки. */
function incTotalB(plan: number, fact: number): BadgeData {
  if (plan <= 0) return badge('Нет плана', 'gray');
  const p = (fact / plan) * 100;
  if (p >= 100) return badge(p > 100 ? 'Выше плана' : 'План выполнен', 'green');
  if (p >= 90) return badge('Внимание · ' + pct1(p) + '%', 'yellow');
  if (p >= 75) return badge('Риск · ' + pct1(p) + '%', 'orange');
  return badge('Критично · ' + pct1(p) + '%', 'red');
}

/** Бейдж исполнения бюджета расходов. */
function expTotalB(plan: number, fact: number): BadgeData {
  if (plan <= 0) return badge('Нет плана', 'gray');
  const p = (fact / plan) * 100;
  if (p > 105) return badge('Перерасход · ' + pct1(p) + '%', 'red');
  if (p > 100) return badge('Внимание · ' + pct1(p) + '%', 'yellow');
  return badge('В норме', 'green');
}

/** Итоги «план–факт» и показатели дашборда.
 *  metrics приходят с сервера (остатки счетов, ожидания, задолженности);
 *  без них (данные ещё грузятся) показываются нули. */
export function computeTotals(incomes: Income[], expenses: Expense[], metrics?: Metrics | null): Totals {
  const incPlan = incomes.reduce((a, r) => a + r.plan, 0), incFact = incomes.reduce((a, r) => a + r.fact, 0);
  const expPlan = expenses.reduce((a, r) => a + r.plan, 0), expFact = expenses.reduce((a, r) => a + r.fact, 0);
  // Защита от деления на ноль (до загрузки данных списки пустые)
  const pctOf = (fact: number, plan: number) => (plan > 0 ? (fact / plan) * 100 : 0);
  const incPct = pctOf(incFact, incPlan), expPct = pctOf(expFact, expPlan);
  const profPlan = incPlan - expPlan, profFact = incFact - expFact;
  const m = metrics ?? null;
  const prevProfit = m?.prevProfitFact ?? null;
  // «К прошлому периоду» — изменение фактической прибыли, «—» без данных
  const prevT = prevProfit == null || prevProfit === 0
    ? '—'
    : (profFact >= prevProfit ? '+' : '−') + pct1(Math.abs(((profFact - prevProfit) / Math.abs(prevProfit)) * 100)) + '%';

  return {
    incPlan, incFact, expPlan, expFact, incPct, expPct, profPlan, profFact,
    incB: incTotalB(incPlan, incFact),
    expB: expTotalB(expPlan, expFact),
    profB: profDevB(profPlan, profFact),
    incPlanF: fmt(incPlan), incFactF: fmt(incFact), incPctT: pct1(incPct) + '%', incPctW: Math.min(incPct, 100).toFixed(1) + '%',
    incDevF: sgn(incFact - incPlan), incForeF: fmt(m?.incForecast ?? incFact), incRestF: fmt(Math.max(incPlan - incFact, 0)),
    expPlanF: fmt(expPlan), expFactF: fmt(expFact), expPctT: pct1(expPct) + '%', expPctW: Math.min(expPct, 100).toFixed(1) + '%',
    expOverF: sgn(m?.expOver ?? 0), expSaveF: sgn(-(m?.expSave ?? 0)),
    profPlanF: fmt(profPlan), profFactF: fmt(profFact), profDevF: sgn(profFact - profPlan),
    rentT: pct1(pctOf(profFact, incFact)) + '%', prevT,
    profPctT: pct1(pctOf(profFact, profPlan)) + '%', profPctW: Math.min(pctOf(profFact, profPlan), 100).toFixed(1) + '%',
    cashBox: fmt(m?.cashBox ?? 0), cashBank: fmt(m?.cashBank ?? 0), cashTotal: fmt(m?.cashTotal ?? 0),
    cashIn: sgn(m?.cashIn ?? 0), cashOut: sgn(-(m?.cashOut ?? 0)),
    cashOutAbs: fmt(m?.cashOut ?? 0), cashFree: fmt(m?.cashFree ?? 0), cashGap: !!m?.cashGap,
    debR: fmt(m?.receivable ?? 0), debROver: fmt(m?.receivableOverdue ?? 0),
    credit: fmt(m?.payable ?? 0), creditOver: fmt(m?.payableOverdue ?? 0),
  };
}

/** Инициалы для аватарок: «ОАО «Обу корез»» → «ОК». */
export function initials(str: string): string {
  const w = str.replace(/[«»"]/g, '').trim().split(/\s+/);
  return (((w[0] || '')[0] || '') + ((w[1] || '')[0] || '')).toUpperCase();
}
