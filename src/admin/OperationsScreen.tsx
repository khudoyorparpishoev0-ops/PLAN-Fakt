import { useState } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt } from '../lib/format';
import { OPS } from '../data/admin';
import { CheckRow, Th } from '../components/ui';

const PARAM_DROPS = ['Загрузка', 'Юрлица и счета', 'Контрагенты', 'Статьи учёта', 'Проекты'];

export interface OperationsScreenProps {
  openIncome: () => void;
}

export default function OperationsScreen(props: OperationsScreenProps) {
  const [filtersOn, setFiltersOn] = useState(true);
  const [opType, setOpType] = useState({ in: true, out: true, move: true, accr: true });
  const [payConf, setPayConf] = useState({ conf: true, unconf: true });

  const toggleType = (k: keyof typeof opType) => setOpType(st => ({ ...st, [k]: !st[k] }));
  const togglePay = (k: keyof typeof payConf) => setPayConf(st => ({ ...st, [k]: !st[k] }));

  const opTypeChecks: [string, boolean, () => void][] = [
    ['Поступление', opType.in, () => toggleType('in')],
    ['Выплата', opType.out, () => toggleType('out')],
    ['Перемещение', opType.move, () => toggleType('move')],
    ['Начисление', opType.accr, () => toggleType('accr')],
  ];
  const payChecks: [string, boolean, () => void][] = [
    ['Подтверждена', payConf.conf, () => togglePay('conf')],
    ['Не подтверждена', payConf.unconf, () => togglePay('unconf')],
  ];

  const rows = OPS.filter(o => (o[2] === 'in' ? opType.in : opType.out)).map(o => {
    const [date, account, dir, party, article, sub, project, amt, cm] = o;
    const dirIn = dir === 'in';
    return {
      date, account, dirIn, party, article, sub, project,
      tag: dirIn ? 'Доходы' : 'Расходы',
      hasComment: cm,
      sumMain: (dirIn ? '+' : '−') + fmt(amt),
      sumFg: dirIn ? '#1A7A4B' : '#B93227',
    };
  });

  return (
    <div data-screen-label="Операции" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {filtersOn ? (
        <div style={{ width: 236, flex: 'none', background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Фильтры</div>
            <div onClick={() => setFiltersOn(false)} title="Свернуть фильтры" className="hv-cream" style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: ACC }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3L5 7l4 4" /><path d="M3 2.5v9" /></svg>
            </div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', marginBottom: 7 }}>ТИП ОПЕРАЦИИ</div>
          {opTypeChecks.map(([t, on, fn]) => <CheckRow key={t} on={on} label={t} onClick={fn} />)}
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '14px 0 7px' }}>ДАТА ОПЛАТЫ</div>
          {payChecks.map(([t, on, fn]) => <CheckRow key={t} on={on} label={t} onClick={fn} />)}
          <input placeholder="Укажите период" style={{ width: '100%', height: 34, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: '#fff', outline: 'none', margin: '9px 0 0' }} />
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '16px 0 8px' }}>ПАРАМЕТРЫ</div>
          {PARAM_DROPS.map(d => (
            <div key={d} className="hv-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #E0DED8', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, color: '#5A625E', marginBottom: 8, cursor: 'pointer' }}>{d} <span style={{ color: '#A6ACA8' }}>▾</span></div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <input placeholder="Сумма от" style={{ width: '50%', height: 34, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: '#fff', outline: 'none' }} />
            <input placeholder="до" style={{ width: '50%', height: 34, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: '#fff', outline: 'none' }} />
          </div>
        </div>
      ) : (
        <div onClick={() => setFiltersOn(true)} title="Показать фильтры" className="hv-row" style={{ width: 38, flex: 'none', background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '11px 0', display: 'flex', justifyContent: 'center', cursor: 'pointer', color: '#5A625E' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12L9.5 8.5V13l-3-1.5V8.5z" /></svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <input placeholder="Поиск по операциям" style={{ width: 280, height: 36, border: '1px solid #E0DED8', borderRadius: 9, padding: '0 12px 0 34px', fontSize: 12.5, background: '#fff', outline: 'none' }} />
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#A6ACA8" strokeWidth="1.5" style={{ position: 'absolute', left: 11, top: 10 }}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          </div>
          <div onClick={props.openIncome} title="Добавить операцию" className="hv-soft" style={{ width: 36, height: 36, border: '1px solid #E0DED8', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5A625E' }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" /></svg>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ padding: '9px 10px 9px 16px', width: 20, borderBottom: '1px solid #E7E5E0' }}><span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid #CFCCC4', display: 'inline-block', verticalAlign: 'middle' }} /></th>
                <Th style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>Дата ▾</Th>
                <Th style={{ padding: '9px 12px' }}>Счёт</Th>
                <Th style={{ padding: '9px 8px', textAlign: 'center' }}>Тип</Th>
                <Th style={{ padding: '9px 12px' }}>Контрагент</Th>
                <Th style={{ padding: '9px 12px' }}>Статья</Th>
                <Th style={{ padding: '9px 12px' }}>Проект</Th>
                <Th right style={{ padding: '9px 16px 9px 12px' }}>Сумма</Th>
              </tr></thead>
              <tbody>
                <tr><td colSpan={8} style={{ padding: '8px 16px', fontSize: 12, color: '#A6ACA8', background: '#FAFAF8', borderBottom: '1px solid #F3F2ED' }}>Сегодня нет операций</td></tr>
                <tr><td colSpan={8} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#5A625E', background: '#FAFAF8', borderBottom: '1px solid #F3F2ED' }}>Вчера и ранее</td></tr>
                {rows.map((r, i) => (
                  <tr key={i} className="hv-row">
                    <td style={{ padding: '10px 10px 10px 16px', borderBottom: '1px solid #F3F2ED' }}><span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid #CFCCC4', display: 'inline-block', verticalAlign: 'middle', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap', fontFamily: PLEX }}>{r.date}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.account}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #F3F2ED', textAlign: 'center' }}>
                      {r.dirIn
                        ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22935B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8H3" /><path d="M6.5 4.5L3 8l3.5 3.5" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#C86B5E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10" /><path d="M9.5 4.5L13 8l-3.5 3.5" /></svg>}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.party}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}><div style={{ fontWeight: 600, color: '#1B1F1E' }}>{r.article} <span style={{ fontWeight: 500, color: '#A6ACA8' }}>[{r.tag}]</span></div><div style={{ fontSize: 11.5, color: '#A6ACA8', marginTop: 1 }}>{r.sub}</div></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                    <td style={{ padding: '10px 16px 10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        {r.hasComment && <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#B0B5B1" strokeWidth="1.4"><path d="M2 3.5h12v7.5H6l-3 2.3V11H2z" /></svg>}
                        <span style={{ fontSize: 13, fontWeight: 600, color: r.sumFg, ...num }}>{r.sumMain}<span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}>,00 TJS</span></span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
