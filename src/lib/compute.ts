import type { Expense, Income } from '../data/admin';
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
  cashOutAbs: string; cashFree: string;
  debR: string; debROver: string; credit: string; creditOver: string;
}

export function computeTotals(incomes: Income[], expenses: Expense[]): Totals {
  const incPlan = incomes.reduce((a, r) => a + r.plan, 0), incFact = incomes.reduce((a, r) => a + r.fact, 0);
  const expPlan = expenses.reduce((a, r) => a + r.plan, 0), expFact = expenses.reduce((a, r) => a + r.fact, 0);
  // Защита от деления на ноль (до загрузки данных списки пустые)
  const pctOf = (fact: number, plan: number) => (plan > 0 ? (fact / plan) * 100 : 0);
  const incPct = pctOf(incFact, incPlan), expPct = pctOf(expFact, expPlan);
  const profPlan = incPlan - expPlan, profFact = incFact - expFact;
  return {
    incPlan, incFact, expPlan, expFact, incPct, expPct, profPlan, profFact,
    incB: badge('Риск · ' + pct1(incPct) + '%', 'orange'),
    expB: badge('В норме', 'green'),
    profB: profDevB(profPlan, profFact),
    incPlanF: fmt(incPlan), incFactF: fmt(incFact), incPctT: pct1(incPct) + '%', incPctW: incPct.toFixed(1) + '%',
    incDevF: sgn(incFact - incPlan), incForeF: fmt(incFact + 310000), incRestF: fmt(incPlan - incFact),
    expPlanF: fmt(expPlan), expFactF: fmt(expFact), expPctT: pct1(expPct) + '%', expPctW: expPct.toFixed(1) + '%',
    expOverF: '+27 500', expSaveF: '−4 500',
    profPlanF: fmt(profPlan), profFactF: fmt(profFact), profDevF: sgn(profFact - profPlan),
    rentT: pct1(pctOf(profFact, incFact)) + '%', prevT: '−8,4%',
    profPctT: pct1(pctOf(profFact, profPlan)) + '%', profPctW: pctOf(profFact, profPlan).toFixed(1) + '%',
    cashBox: '84 200', cashBank: '512 600', cashTotal: '596 800', cashIn: '+310 000', cashOut: '−142 000',
    cashOutAbs: '142 000', cashFree: '764 800',
    debR: '110 000', debROver: '60 000', credit: '148 500', creditOver: '18 500',
  };
}

/** Инициалы для аватарок: «ОАО «Обу корез»» → «ОК». */
export function initials(str: string): string {
  const w = str.replace(/[«»"]/g, '').trim().split(/\s+/);
  return (((w[0] || '')[0] || '') + ((w[1] || '')[0] || '')).toUpperCase();
}
