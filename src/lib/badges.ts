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

/** Бейдж отклонения по доходам. */
export function incDevB(plan: number, fact: number, pending?: boolean): BadgeData {
  if (!plan) return badge('План не указан', 'gray');
  if (pending && !fact) return badge('Ожидается', 'gray');
  const p = (fact / plan) * 100;
  if (p >= 100) return badge(p > 100 ? 'Выше плана' : 'План выполнен', 'green');
  if (p >= 90) return badge('Ниже плана', 'yellow');
  if (p >= 75) return badge('Риск', 'orange');
  return badge('Критично', 'red');
}

/** Бейдж отклонения по расходам (пороги недорасхода из ТЗ). */
export function expDevB(plan: number, fact: number, pending?: boolean): BadgeData {
  if (!plan) return badge('План не указан', 'gray');
  if (pending && !fact) return badge('Нет данных', 'gray');
  if (fact === plan) return badge('По плану', 'green');
  if (fact < plan) {
    const u = ((plan - fact) / plan) * 100;
    if (u <= 5) return badge('В норме', 'green');
    if (u <= 20) return badge('Экономия', 'green');
    return badge('Проверить план', 'yellow');
  }
  const o = ((fact - plan) / plan) * 100;
  if (o <= 5) return badge('Внимание', 'yellow');
  if (o <= 10) return badge('Риск', 'orange');
  return badge('Перерасход', 'red');
}

/** Бейдж выполнения плана прибыли. */
export function profDevB(plan: number, fact: number): BadgeData {
  if (plan <= 0) return badge('Нет данных', 'gray');
  if (fact < 0) return badge('Убыток', 'red');
  const p = (fact / plan) * 100;
  if (p >= 100) return badge('План выполнен', 'green');
  if (p >= 85) return badge('Внимание · ' + pct1(p) + '%', 'yellow');
  if (p >= 70) return badge('Риск · ' + pct1(p) + '%', 'orange');
  return badge('Критично', 'red');
}

export interface DevInfo { devF: string; devPctF: string; devFg: string }

/** Отклонение факт−план: форматированные значение, процент и цвет. */
export function devInfo(type: 'inc' | 'exp', plan: number, fact: number, pending?: boolean): DevInfo {
  if (!plan || (pending && !fact)) return { devF: '—', devPctF: '—', devFg: '#9AA29E' };
  const d = fact - plan, p = (d / plan) * 100;
  let fg = '#6B7370';
  if (d !== 0) fg = (type === 'inc' ? d > 0 : d < 0) ? '#1A7A4B' : '#B93227';
  return { devF: sgn(d), devPctF: (d > 0 ? '+' : d < 0 ? '−' : '') + pct1(Math.abs(p)) + '%', devFg: fg };
}
