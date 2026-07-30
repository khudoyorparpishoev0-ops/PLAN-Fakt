/** Преобразование ответов API (ШАГ 3) в формы данных экранов —
 *  интерфейсы экранов остались как в прототипе, меняется только источник. */
import type { ApiOperation, ApiPlanFactRow, ApiRequest } from './api';
import type { Expense, Income } from '../data/admin';
import type { CarCategory, CarReq, PayReq, ReqStatus, TripReq } from '../data/cabinet';
import { tripAmount } from '../data/settings';

/** 'YYYY-MM-DD' → '28.10.2026'. */
export function dotDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** 'YYYY-MM-DD' | null → '28.10' | '—' (колонки план-факта). */
export function dotDateShort(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_MONTHS_NOM = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/** 'YYYY-MM-DD' → '20 ноя 2025' (журнал операций). */
export function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d} ${RU_MONTHS[+m - 1]} ${y}`;
}

export const STATUS_RU: Record<ApiRequest['status'], ReqStatus> = {
  draft: 'Черновик',
  sent: 'Отправлено',
  review: 'На рассмотрении',
  approved: 'Одобрено',
  rejected: 'Отклонено',
};

const attachment = (r: ApiRequest): string | undefined => r.attachments[0]?.fileName;

export const toPay = (r: ApiRequest): PayReq => ({
  id: r.number, dbId: r.id, date: dotDate(r.date), project: r.project, name: r.name,
  amount: r.amount ?? 0, currency: r.currency ?? 'TJS', status: STATUS_RU[r.status], doc: attachment(r),
});

export const toTrip = (r: ApiRequest): TripReq => ({
  id: r.number, dbId: r.id, date: dotDate(r.date), project: r.project, goal: r.name,
  km: r.km ?? 0, contragent: r.counterparty ?? '—', status: STATUS_RU[r.status], photo: attachment(r) ?? '',
});

export const toCar = (r: ApiRequest): CarReq => ({
  id: r.number, dbId: r.id, date: dotDate(r.date), project: r.project,
  category: (r.category ?? r.name) as CarCategory, amount: r.amount ?? 0,
  currency: r.currency ?? 'TJS', status: STATUS_RU[r.status], receipt: attachment(r),
});

export const toIncome = (r: ApiPlanFactRow): Income => ({
  n: r.n, cat: r.cat, proj: r.proj, party: r.party,
  pdate: dotDateShort(r.pdate), fdate: dotDateShort(r.fdate),
  plan: r.plan, fact: r.fact, status: r.status, resp: r.resp,
  ...(r.pending ? { pending: true } : {}),
});

export const toExpense = (r: ApiPlanFactRow): Expense => ({
  n: r.n, cat: r.cat, proj: r.proj, payee: r.party,
  pdate: dotDateShort(r.pdate), fdate: dotDateShort(r.fdate),
  plan: r.plan, fact: r.fact, status: r.status, resp: r.resp,
  ...(r.pending ? { pending: true } : {}),
  ...(r.reason ? { reason: r.reason } : {}),
});

/** Строка журнала операций для экрана «Операции». */
export interface JournalRow {
  id: number;
  date: string; // «20 ноя 2025»
  account: string;
  dirIn: boolean;
  isPlan: boolean;
  party: string;
  article: string;
  sub: string;
  project: string;
  amount: number;
}

export const toJournalRow = (o: ApiOperation): JournalRow => ({
  id: o.id,
  date: ruDate(o.date),
  account: o.account ?? '—',
  dirIn: o.type === 'in',
  isPlan: o.isPlan,
  party: o.party ?? '—',
  article: o.article ?? '—',
  sub: o.comment ?? '',
  project: o.project ?? '—',
  amount: o.amount,
});

/** «Статистика по месяцам» кабинета: суммы моих заявок по месяцам
 *  (поездки — в деньгах только при заданной ставке компенсации),
 *  последние 6 месяцев с данными. */
export function monthlyStats(requests: ApiRequest[]): { m: string; sum: number }[] {
  if (requests.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const r of requests) {
    const key = r.date.slice(0, 7); // YYYY-MM
    const sum = r.kind === 'trip' ? tripAmount(r.km ?? 0) : r.amount ?? 0;
    byMonth.set(key, (byMonth.get(key) ?? 0) + sum);
  }
  const last = [...byMonth.keys()].sort().pop()!;
  const [ly, lm] = last.split('-').map(Number);
  const out: { m: string; sum: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(ly, lm - 1 - i, 1));
    const key = dt.toISOString().slice(0, 7);
    out.push({ m: RU_MONTHS_NOM[dt.getUTCMonth()], sum: byMonth.get(key) ?? 0 });
  }
  return out;
}
