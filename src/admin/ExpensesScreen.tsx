import type { CSSProperties } from 'react';
import type { Expense } from '../data/admin';
import type { Totals } from '../lib/compute';
import { ACC, SOFT, ROW_PAD, PLEX, GOLOS, num } from '../theme';
import { expRow } from '../lib/rows';
import { AccentBtn, Badge, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';

export interface ExpensesScreenProps {
  expenses: Expense[];
  totals: Totals;
  /** Число заявок кабинета, ждущих решения (чип «На согласовании»). */
  pendingCount: number;
  goIncomes: () => void;
  openExpense: (i: number) => void;
  /** Открыть форму «Новый расход» (журнал операций). */
  openCreate: () => void;
}

const card: CSSProperties = { background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '15px 18px', display: 'flex', flexDirection: 'column', minHeight: 116 };
const lab: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--fin-text-4)', marginBottom: 7 };
const val: CSSProperties = { fontSize: 25, fontWeight: 700, letterSpacing: '-.02em', ...num };
const tjs: CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--fin-text-4)', fontFamily: GOLOS };
const ico: CSSProperties = { width: 30, height: 30, borderRadius: 9, background: SOFT, color: ACC, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export default function ExpensesScreen(props: ExpensesScreenProps) {
  const isMobile = useIsMobile();
  const t = props.totals;
  const rows = props.expenses.map(expRow);
  return (
    <div data-screen-label="Расходы">
      <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2, marginBottom: 14 }}>
        <div onClick={props.goIncomes} style={{ padding: '5px 18px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--fin-text-3)', cursor: 'pointer' }}>Доходы</div>
        <div style={{ padding: '5px 18px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, background: 'var(--fin-surface)', boxShadow: '0 1px 2px rgba(0,0,0,.08)', cursor: 'pointer' }}>Расходы</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        <div style={card}>
          <div style={lab}>ПЛАН</div>
          <div style={val}>{t.expPlanF} <span style={tjs}>TJS</span></div>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}><span style={ico}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2.5" width="10" height="11.5" rx="1.8" /><rect x="5.5" y="1" width="5" height="3" rx="1" /><path d="M5.5 7.5h5M5.5 10.5h3.5" /></svg></span></div>
        </div>
        <div style={card}>
          <div style={lab}>ФАКТ</div>
          <div style={val}>{t.expFactF} <span style={tjs}>TJS</span></div>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}><span style={ico}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13.5h12" /><path d="M4 13.5V8.5M8 13.5V5M12 13.5V6.5" /></svg></span></div>
        </div>
        <div style={card}>
          <div style={lab}>БЮДЖЕТ ИСПОЛЬЗОВАН</div>
          <div style={val}>{t.expPctT}</div>
          <div style={{ marginTop: 'auto', paddingTop: 14 }}><div style={{ height: 7, background: 'var(--fin-bg)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', background: t.expB.dot, width: t.expPctW }} /></div></div>
        </div>
        <div style={card}>
          <div style={lab}>К ОПЛАТЕ ДО КОНЦА МЕСЯЦА</div>
          <div style={{ ...val, color: 'var(--fin-minus)' }}>{t.cashOutAbs} <span style={tjs}>TJS</span></div>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}><span style={{ ...ico, background: 'var(--fin-minus-soft)', color: 'var(--fin-minus)' }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3.5" width="12" height="9" rx="1.8" /><path d="M2 6.5h12" /></svg></span></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="Поиск: категория, получатель, №…" style={{ width: 260, height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 12px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none' }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Статус: <b style={{ color: 'var(--fin-text)', fontWeight: 600 }}>Все</b> <span style={{ color: 'var(--fin-text-5)' }}>▾</span></div>
        {props.pendingCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: 'var(--fin-warn)', background: 'var(--fin-warn-soft)', cursor: 'pointer' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fin-warn)' }} />На согласовании: {props.pendingCount}</span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--fin-text-4)' }}>Нажмите строку — карточка заявки</div>
        <AccentBtn style={{ padding: '8px 15px' }} onClick={props.openCreate}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Расход</AccentBtn>
      </div>
      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th style={{ padding: '8px 12px 8px 16px' }}>№ / Категория</Th>
            <Th>Получатель</Th>
            <Th right>Дата план</Th>
            <Th right>Дата факт</Th>
            <Th right>План</Th>
            <Th right>Факт</Th>
            <Th right>Откл.</Th>
            <Th>Статус</Th>
            <Th style={{ padding: '8px 16px 8px 12px' }}>Инициатор</Th>
          </tr></thead>
          <tbody>
          {rows.map((r, i) => (
            <tr key={r.n} onClick={() => props.openExpense(i)} className="hv-row" style={{ cursor: 'pointer' }}>
              <td style={{ padding: ROW_PAD, paddingLeft: 16, borderBottom: '1px solid var(--fin-divider)' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.cat}</div><div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>{r.n} · {r.proj}</div></td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 }}>{r.payee}</td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, textAlign: 'right', color: 'var(--fin-text-3)', fontFamily: PLEX }}>{r.pdate}</td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, textAlign: 'right', color: 'var(--fin-text-3)', fontFamily: PLEX }}>{r.fdate}</td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', ...num, whiteSpace: 'nowrap' }}>{r.planF}</td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{r.factF}</td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: 600, color: r.devFg, ...num, whiteSpace: 'nowrap' }}>{r.devF}</td>
              <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)' }}><Badge b={r.b} /></td>
              <td style={{ padding: ROW_PAD, paddingRight: 16, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: 'var(--fin-text-2)' }}>{r.resp}</td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
