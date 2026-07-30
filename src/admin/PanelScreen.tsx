import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Expense, Income } from '../data/admin';
import type { Totals } from '../lib/compute';
import type { ApiRequest } from '../lib/api';
import { ACC, SOFT, ROW_PAD, CARD_PAD, GOLOS, num } from '../theme';
import { fmt } from '../lib/format';
import { devInfo, incDevB, expDevB } from '../lib/badges';
import { Badge, Th } from '../components/ui';

export interface PanelScreenProps {
  incomes: Income[];
  expenses: Expense[];
  totals: Totals;
  /** Заявки кабинета, ждущие решения (Отправлено / На рассмотрении). */
  pendingReqs: ApiRequest[];
  /** Решение по заявке — PATCH /api/requests/:id/status. */
  decideRequest: (id: number, status: 'approved' | 'rejected') => void;
  goReport: () => void;
  goExpenses: () => void;
}

const KIND_LABEL: Record<ApiRequest['kind'], string> = { payment: 'Оплата', trip: 'Поездка', auto: 'Авто' };

const PERIODS = ['День', 'Неделя', 'Месяц', 'Квартал', 'Год', 'Период'];
const FILTERS: [string, string][] = [
  ['Проект', 'Все'], ['Категория', 'Все'], ['Контрагент', 'Все'], ['Валюта', 'TJS'], ['Статус', 'Все'],
];
const chipS: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E0DED8', background: '#fff',
  borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: '#5A625E', cursor: 'pointer',
};
const cardS: CSSProperties = { background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: CARD_PAD };
const headS: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 };
const labS: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: '#8A918D' };
const bigS: CSSProperties = { fontSize: 25, fontWeight: 700, letterSpacing: '-.02em', ...num };
const tjsS: CSSProperties = { fontSize: 11.5, fontWeight: 500, color: '#8A918D', fontFamily: GOLOS };
const tjs12S: CSSProperties = { fontSize: 12, fontWeight: 500, color: '#8A918D', fontFamily: GOLOS };
const v500: CSSProperties = { color: '#1B1F1E', fontWeight: 500, ...num };
const v600: CSSProperties = { color: '#1B1F1E', fontWeight: 600, ...num };
const red6: CSSProperties = { fontWeight: 600, color: '#B93227', ...num };
const grn6: CSSProperties = { fontWeight: 600, color: '#1A7A4B', ...num };

/** Иконочный чип шапки KPI-карточки (28px, акцент). */
function KpiChip({ children }: { children: ReactNode }) {
  return (
    <span style={{ width: 28, height: 28, borderRadius: 8, background: SOFT, color: ACC, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {children}
    </span>
  );
}

/** Строка «подпись — значение» внутри KPI-карточки. */
function KV({ l, v, vs, ls, style }: { l: ReactNode; v: ReactNode; vs: CSSProperties; ls?: CSSProperties; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7370', marginBottom: 4, ...style }}>
      <span style={ls}>{l}</span><span style={vs}>{v}</span>
    </div>
  );
}

/** Прогресс выполнения плана в KPI-карточке. */
function Prog({ dot, w, t }: { dot: string; w: string; t: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 11px' }}>
      <div style={{ flex: 1, height: 6, background: '#EEF1EE', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: dot, width: w }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: dot, ...num }}>{t}</span>
    </div>
  );
}

/** Иконки категорий и событий (viewBox 16×16). */
function Ico({ ic, s }: { ic: string; s: number }) {
  const p = { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const;
  if (ic === 'money') return <svg {...p}><rect x="2.5" y="4" width="11" height="8" rx="1.5" /><circle cx="8" cy="8" r="1.8" /></svg>;
  if (ic === 'cart') return <svg {...p}><circle cx="6" cy="13.5" r="1" /><circle cx="12" cy="13.5" r="1" /><path d="M1.5 2h2l1.5 8.5h7L14 5H4.2" /></svg>;
  if (ic === 'people') return <svg {...p}><circle cx="6" cy="6" r="2.3" /><path d="M1.8 13a4.2 4.2 0 018.4 0" /><path d="M10.5 4.2a2.3 2.3 0 010 4.3" /></svg>;
  if (ic === 'truck') return <svg {...p}><rect x="1" y="4" width="9" height="6.5" rx="1" /><path d="M10 6.5h2.5L15 9v1.5h-5" /><circle cx="4" cy="11.5" r="1.2" /><circle cx="12" cy="11.5" r="1.2" /></svg>;
  if (ic === 'card') return <svg {...p}><rect x="1.5" y="3.5" width="13" height="9" rx="1.8" /><path d="M1.5 6.5h13" /></svg>;
  if (ic === 'percent') return <svg {...p}><circle cx="5" cy="5" r="1.4" /><circle cx="11" cy="11" r="1.4" /><path d="M12 4L4 12" /></svg>;
  if (ic === 'clock') return <svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.3 1.6" /></svg>;
  return <svg {...p}><path d="M4 6.5a4 4 0 018 0c0 3 1.2 4 1.2 4H2.8S4 9.5 4 6.5z" /><path d="M6.5 13a1.5 1.5 0 003 0" /></svg>;
}

const icMap: Record<string, string> = {
  'Оплата заказчиков': 'money', 'Закупка оборудования': 'cart', 'Подрядчики': 'people',
  'Транспорт': 'truck', 'Зарплата': 'card', 'Налоги': 'percent',
};
function dR(type: 'inc' | 'exp', cat: string, plan: number, fact: number, pending?: boolean) {
  return {
    ic: icMap[cat] || 'money', cat,
    planF: fmt(plan), factF: pending && !fact ? '—' : fmt(fact),
    ...devInfo(type, plan, fact, pending),
    b: type === 'inc' ? incDevB(plan, fact, pending) : expDevB(plan, fact, pending),
  };
}

interface AttnItem {
  ic: string; chipBg: string; chipFg: string; t: string; m: string;
  sum: string; sumFg: string; tag: string; reqId?: number;
}

const btnS: CSSProperties = { borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const thTop: CSSProperties = { borderTop: '1px solid #F0EFEA' };
const tdNum: CSSProperties = { padding: ROW_PAD, borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', ...num, whiteSpace: 'nowrap' };

export default function PanelScreen(props: PanelScreenProps) {
  const { expenses, totals: t, pendingReqs, decideRequest, goReport, goExpenses } = props;
  const [period, setPeriod] = useState('Месяц');

  /* ── «План–факт по категориям» — выжимка из реальных данных:
   *    крупнейшая доходная категория + топ-5 расходных по плану ── */
  const aggregate = (rows: { cat: string; plan: number; fact: number; pending?: boolean }[]) => {
    const byCat = new Map<string, { plan: number; fact: number; pending: boolean }>();
    for (const r of rows) {
      const acc = byCat.get(r.cat) ?? { plan: 0, fact: 0, pending: false };
      acc.plan += r.plan; acc.fact += r.fact; acc.pending = acc.pending || !!r.pending;
      byCat.set(r.cat, acc);
    }
    return [...byCat.entries()].sort((a, b) => b[1].plan - a[1].plan);
  };
  const dashRows = [
    ...aggregate(props.incomes).slice(0, 1).map(([cat, v]) => dR('inc', cat, v.plan, v.fact, v.pending && !v.fact)),
    ...aggregate(expenses).slice(0, 5).map(([cat, v]) => dR('exp', cat, v.plan, v.fact, v.pending && !v.fact)),
  ];

  const attnItems: AttnItem[] = [
    { ic: 'clock', chipBg: '#FAE7E4', chipFg: '#B93227', t: 'Просроченный платёж', m: '«Сомон Сервис» · 10 дней просрочки', sum: '60 000', sumFg: '#B93227', tag: 'дебиторка' },
    { ic: 'cart', chipBg: '#FAE7E4', chipFg: '#B93227', t: 'Перерасход: закупка оборудования', m: '«ТаджТехСнаб» · причина: рост цены', sum: '+25 000', sumFg: '#B93227', tag: '+12,5% к плану' },
    { ic: 'percent', chipBg: '#FBECDE', chipFg: '#B25313', t: 'Обязательный платёж: налоги', m: 'Оплатить до 25.10', sum: '85 000', sumFg: '#1B1F1E', tag: '4 дня' },
    // Реальные заявки кабинета, ждущие решения (ШАГ 3)
    ...pendingReqs.map((r): AttnItem => ({
      ic: 'bell', chipBg: '#FAF2D8', chipFg: '#8A6A00',
      t: 'Ждёт вашего согласования',
      m: `${KIND_LABEL[r.kind]} · ${r.name} · заявка ${r.number}`,
      sum: r.kind === 'trip' ? `${fmt(r.km ?? 0)} км` : fmt(r.amount ?? 0),
      sumFg: '#1B1F1E',
      tag: `от ${r.author}`,
      reqId: r.id,
    })),
  ];

  return (
    <div data-screen-label="Финансовая панель">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'inline-flex', background: '#EBEAE4', padding: 3, borderRadius: 9, gap: 2 }}>
          {PERIODS.map(p => {
            const a = period === p;
            return (
              <div key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: a ? 600 : 500, color: a ? '#1B1F1E' : '#6B7370', background: a ? '#FFFFFF' : 'transparent', boxShadow: a ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{p}</div>
            );
          })}
        </div>
        <div style={{ width: 1, height: 22, background: '#E0DED8' }} />
        {FILTERS.map(([l, v]) => (
          <div key={l} style={chipS}>{l}: <b style={{ color: '#1B1F1E', fontWeight: 600 }}>{v}</b> <span style={{ color: '#A6ACA8' }}>▾</span></div>
        ))}
        <div title="Ответственный, тип операции" className="hv-cream" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px dashed #CFCCC4', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: '#6B7370', cursor: 'pointer' }}>Ещё <span style={{ color: '#A6ACA8' }}>▾</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 16 }}>
        <div style={cardS}>
          <div style={headS}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KpiChip><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 11l3.5-3.5 2.5 2L14 3.5" /><path d="M10 3.5h4v4" /></svg></KpiChip>
              <span style={labS}>ДОХОДЫ</span>
            </span>
            <Badge b={t.incB} fs={11} pad="2px 8px" />
          </div>
          <div style={bigS}>{t.incFactF} <span style={tjsS}>TJS</span></div>
          <Prog dot={t.incB.dot} w={t.incPctW} t={t.incPctT} />
          <KV l="План" v={t.incPlanF} vs={v500} />
          <KV l="Выполнение" v={t.incPctT} vs={v600} />
          <KV l="Отклонение" v={t.incDevF} vs={red6} />
          <KV l="Прогноз" v={t.incForeF} vs={v500} style={{ marginBottom: 0 }} />
        </div>
        <div style={cardS}>
          <div style={headS}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KpiChip><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="8.5" rx="1.8" /><path d="M2 7h12" /><circle cx="11" cy="10" r="1" /></svg></KpiChip>
              <span style={labS}>РАСХОДЫ</span>
            </span>
            <Badge b={t.expB} fs={11} pad="2px 8px" />
          </div>
          <div style={bigS}>{t.expFactF} <span style={tjsS}>TJS</span></div>
          <Prog dot={t.expB.dot} w={t.expPctW} t={t.expPctT} />
          <KV l="План" v={t.expPlanF} vs={v500} />
          <KV l="Бюджет использован" v={t.expPctT} vs={v600} />
          <KV l="Перерасход" v={t.expOverF} vs={red6} />
          <KV l="Экономия" v={t.expSaveF} vs={grn6} style={{ marginBottom: 0 }} />
        </div>
        <div style={cardS}>
          <div style={headS}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KpiChip><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4" /><path d="M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8" /></svg></KpiChip>
              <span style={labS}>ПРИБЫЛЬ</span>
            </span>
            <Badge b={t.profB} fs={11} pad="2px 8px" />
          </div>
          <div style={bigS}>{t.profFactF} <span style={tjsS}>TJS</span></div>
          <Prog dot={t.profB.dot} w={t.profPctW} t={t.profPctT} />
          <KV l="План" v={t.profPlanF} vs={v500} />
          <KV l="Отклонение" v={t.profDevF} vs={red6} />
          <KV l="Рентабельность" v={t.rentT} vs={v600} />
          <KV l="К прошлому периоду" vs={{ fontWeight: 600, color: '#B25313', ...num }} style={{ marginBottom: 0 }} v={<><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ verticalAlign: -1, marginRight: 2 }}><path d="M2 2l6 6M8 3.5V8H3.5" /></svg>{t.prevT}</>} />
        </div>
        <div style={cardS}>
          <div style={headS}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KpiChip><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3.5" width="12" height="9" rx="2" /><path d="M2 6.5h12" /><circle cx="11" cy="9.5" r="1" /></svg></KpiChip>
              <span style={labS}>ДЕНЬГИ</span>
            </span>
          </div>
          <div style={bigS}>{t.cashTotal} <span style={tjs12S}>TJS</span></div>
          <div style={{ fontSize: 12, color: '#8A918D', margin: '5px 0 11px' }}>Остаток на счетах</div>
          <KV l="Касса" v={t.cashBox} vs={v500} />
          <KV l="Банковские счета" v={t.cashBank} vs={v500} />
          <KV l="Ожидаемые поступления" v={t.cashIn} vs={grn6} />
          <KV l="Предстоящие выплаты" v={t.cashOut} vs={red6} />
          <KV l="Свободный остаток" ls={{ fontWeight: 600, color: '#1B1F1E' }} v={t.cashFree} vs={{ color: '#1B1F1E', fontWeight: 700, ...num }} style={{ borderTop: '1px dashed #E7E5E0', paddingTop: 6, marginTop: 6, marginBottom: 0 }} />
          <KV l="Кассовый разрыв" vs={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: '#1A7A4B' }} style={{ marginTop: 5, marginBottom: 0 }} v={<><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22935B' }} />не ожидается</>} />
        </div>
        <div style={cardS}>
          <div style={headS}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KpiChip><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="2.3" /><path d="M1.8 13a4.2 4.2 0 018.4 0" /><path d="M10.5 4.2a2.3 2.3 0 010 4.3" /></svg></KpiChip>
              <span style={labS}>ЗАДОЛЖЕННОСТИ</span>
            </span>
            <Badge b={{ t: 'Просрочка', fg: '#B93227', bg: '#FAE7E4', dot: '#D24A3D' }} fs={11} pad="2px 8px" />
          </div>
          <div style={bigS}>{t.debR} <span style={tjs12S}>TJS</span></div>
          <div style={{ fontSize: 12, color: '#8A918D', margin: '5px 0 11px' }}>Общая задолженность</div>
          <KV l="Из них просрочено" v={t.debROver} vs={red6} />
          <KV l="Кредиторская" v={t.credit} vs={v500} />
          <KV l="Из них просрочено" v={t.creditOver} vs={red6} style={{ marginBottom: 0 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(430px,1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>План–факт по категориям</div>
            <div onClick={goReport} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>Открыть отчёт →</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th style={{ padding: '7px 16px', ...thTop }}>Категория</Th>
                <Th right style={{ padding: '7px 12px', ...thTop }}>План</Th>
                <Th right style={{ padding: '7px 12px', ...thTop }}>Факт</Th>
                <Th right style={{ padding: '7px 12px', ...thTop }}>Откл.</Th>
                <Th right style={{ padding: '7px 12px', ...thTop }}>Откл. %</Th>
                <Th style={{ padding: '7px 16px 7px 12px', ...thTop }}>Статус</Th>
              </tr></thead>
              <tbody>
                {dashRows.map(r => (
                  <tr key={r.cat}>
                    <td style={{ padding: ROW_PAD, borderBottom: '1px solid #F3F2ED', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: SOFT, color: ACC, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Ico ic={r.ic} s={14} /></span>
                        <span>{r.cat}</span>
                      </div>
                    </td>
                    <td style={tdNum}>{r.planF}</td>
                    <td style={{ ...tdNum, fontWeight: 600 }}>{r.factF}</td>
                    <td style={{ ...tdNum, fontWeight: 600, color: r.devFg }}>{r.devF}</td>
                    <td style={{ ...tdNum, fontSize: 12.5, color: r.devFg }}>{r.devPctF}</td>
                    <td style={{ padding: ROW_PAD, borderBottom: '1px solid #F3F2ED' }}><Badge b={r.b} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Требует внимания</div>
            <span style={{ background: '#FAE7E4', color: '#B93227', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 8px' }}>{attnItems.length}</span>
          </div>
          {attnItems.map((a, i) => (
            <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid #F3F2ED' }}>
              <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: a.chipBg, color: a.chipFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Ico ic={a.ic} s={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.t}</div>
                  <div style={{ fontSize: 12, color: '#8A918D', marginTop: 1 }}>{a.m}</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: a.sumFg, ...num }}>{a.sum}</div>
                  <div style={{ fontSize: 11, color: '#A6ACA8' }}>{a.tag}</div>
                </div>
              </div>
              {a.reqId != null && (
                <div style={{ display: 'flex', gap: 8, margin: '9px 0 2px 18px' }}>
                  <div onClick={() => decideRequest(a.reqId!, 'approved')} className="hv-dim" style={{ background: ACC, color: '#fff', ...btnS }}>Согласовать</div>
                  <div onClick={() => decideRequest(a.reqId!, 'rejected')} className="hv-red" style={{ border: '1px solid #F0CFC9', color: '#B93227', ...btnS }}>Отклонить</div>
                  <div onClick={goReport} className="hv-soft" style={{ border: '1px solid #E0DED8', color: '#3E4643', ...btnS }}>Открыть</div>
                </div>
              )}
            </div>
          ))}
          {attnItems.length === 0 && (
            <div style={{ padding: '26px 0', textAlign: 'center', color: '#8A918D', fontSize: 12.5 }}>Всё в порядке — просрочек и критических отклонений нет</div>
          )}
          <div onClick={goExpenses} className="hv-soft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid #E0DED8', borderRadius: 10, padding: 11, marginTop: 12, fontSize: 13, fontWeight: 600, color: ACC, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6.5a4 4 0 018 0c0 3 1.2 4 1.2 4H2.8S4 9.5 4 6.5z" /><path d="M6.5 13a1.5 1.5 0 003 0" /></svg>Показать все события →
          </div>
          <div style={{ background: '#F6F7F6', borderRadius: 10, padding: '11px 13px', marginTop: 12, fontSize: 12, color: '#8A918D', lineHeight: 1.5 }}>
            Статусы: <span style={{ color: '#1A7A4B', fontWeight: 600 }}>зелёный</span> — в норме, <span style={{ color: '#8A6A00', fontWeight: 600 }}>жёлтый</span> — внимание, <span style={{ color: '#B25313', fontWeight: 600 }}>оранжевый</span> — риск, <span style={{ color: '#B93227', fontWeight: 600 }}>красный</span> — критично, <span style={{ fontWeight: 600 }}>серый</span> — нет данных.
          </div>
        </div>
      </div>
    </div>
  );
}
