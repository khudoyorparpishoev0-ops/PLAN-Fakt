import { useEffect, useRef, useState } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt } from '../lib/format';
import { api, ApiError, type ApiDictionaries, type ApiOperation, type ApiProject } from '../lib/api';
import { ruDate } from '../lib/mapping';
import { CheckRow, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';

const PAGE = 50;

export interface OperationsScreenProps {
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  /** Открыть форму добавления операции (доход/расход). */
  openCreate: (kind: 'in' | 'out') => void;
  /** Растёт при каждом добавлении операции — сигнал перезагрузить список. */
  refreshTick: number;
  onError: (msg: string) => void;
}

const selS: React.CSSProperties = { width: '100%', height: 34, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: '#fff', color: '#5A625E', marginBottom: 8, outline: 'none' };
const inpS: React.CSSProperties = { height: 34, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: '#fff', outline: 'none' };

/** Журнал операций: данные и фильтры — серверные (GET /api/operations,
 *  ТЗ п. 9: комбинируемые фильтры, лимит/оффсет). */
export default function OperationsScreen(props: OperationsScreenProps) {
  const { dicts, projects } = props;
  const isMobile = useIsMobile();
  const [filtersOn, setFiltersOn] = useState(true);
  const [opType, setOpType] = useState({ in: true, out: true, move: true, accr: true });
  const [payConf, setPayConf] = useState({ conf: true, unconf: true });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fAccount, setFAccount] = useState('');
  const [fParty, setFParty] = useState('');
  const [fArticle, setFArticle] = useState('');
  const [fProject, setFProject] = useState('');
  const [sumMin, setSumMin] = useState('');
  const [sumMax, setSumMax] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  const [rows, setRows] = useState<ApiOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const toggleType = (k: keyof typeof opType) => setOpType(st => ({ ...st, [k]: !st[k] }));
  const togglePay = (k: keyof typeof payConf) => setPayConf(st => ({ ...st, [k]: !st[k] }));

  // Поиск с задержкой, чтобы не дёргать сервер на каждый символ
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = (offset: number) => {
    const types: string[] = [];
    if (opType.in) types.push('in');
    if (opType.out) types.push('out');
    if (opType.move) types.push('move');
    if (opType.accr) types.push('accrual');
    return {
      type: types,
      confirmed: payConf.conf === payConf.unconf ? undefined : payConf.conf,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      account: fAccount ? Number(fAccount) : undefined,
      counterparty: fParty ? Number(fParty) : undefined,
      article: fArticle ? Number(fArticle) : undefined,
      project: fProject ? Number(fProject) : undefined,
      amountMin: sumMin.trim() ? Number(sumMin.trim().replace(/\s/g, '').replace(',', '.')) : undefined,
      amountMax: sumMax.trim() ? Number(sumMax.trim().replace(/\s/g, '').replace(',', '.')) : undefined,
      q: q || undefined,
      limit: PAGE,
      offset,
    };
  };

  const load = async (offset: number) => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const res = await api.operations(buildQuery(offset));
      if (my !== seq.current) return; // пришёл более свежий запрос
      setRows(r => (offset === 0 ? res.rows : [...r, ...res.rows]));
      setTotal(res.total);
    } catch (e) {
      props.onError(e instanceof ApiError ? e.message : 'Не удалось загрузить операции');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opType, payConf, dateFrom, dateTo, fAccount, fParty, fArticle, fProject, sumMin, sumMax, q, props.refreshTick]);

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

  const articleOptions = dicts
    ? [...dicts.articles.income, ...dicts.articles.expense].flatMap(a => [
        { id: a.id, name: a.name },
        ...a.children,
      ])
    : [];

  const view = rows.map(o => {
    const whole = Math.floor(Math.abs(o.amount));
    const dirams = Math.round((Math.abs(o.amount) - whole) * 100);
    const sign = o.amount < 0 ? '−' : o.type === 'in' ? '+' : '−';
    return {
      key: o.id,
      date: ruDate(o.date), account: o.account ?? '—', dirIn: o.type === 'in',
      party: o.party ?? '—', article: o.article ?? '—', sub: o.comment ?? '', project: o.project ?? '—',
      // Плановые операции (из одобренных заявок) помечаются в журнале тегом «План»
      tag: o.isPlan ? 'План' : o.type === 'in' ? 'Доходы' : 'Расходы',
      sumMain: sign + fmt(whole),
      sumFrac: ',' + String(dirams).padStart(2, '0') + ' TJS',
      sumFg: o.type === 'in' ? '#1A7A4B' : '#B93227',
    };
  });

  return (
    <div data-screen-label="Операции" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'stretch' }}>
      {filtersOn ? (
        <div style={{ width: isMobile ? '100%' : 236, flex: 'none', background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px' }}>
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
          <div style={{ display: 'flex', gap: 8, margin: '9px 0 0' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Период с" style={{ ...inpS, width: '50%', padding: '0 6px' }} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Период по" style={{ ...inpS, width: '50%', padding: '0 6px' }} />
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '16px 0 8px' }}>ПАРАМЕТРЫ</div>
          <select value={fAccount} onChange={e => setFAccount(e.target.value)} style={selS}>
            <option value="">Юрлица и счета: все</option>
            {(dicts?.accounts ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={fParty} onChange={e => setFParty(e.target.value)} style={selS}>
            <option value="">Контрагенты: все</option>
            {(dicts?.counterparties ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={fArticle} onChange={e => setFArticle(e.target.value)} style={selS}>
            <option value="">Статьи учёта: все</option>
            {articleOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={fProject} onChange={e => setFProject(e.target.value)} style={selS}>
            <option value="">Проекты: все</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <input value={sumMin} onChange={e => setSumMin(e.target.value)} placeholder="Сумма от" style={{ ...inpS, width: '50%' }} />
            <input value={sumMax} onChange={e => setSumMax(e.target.value)} placeholder="до" style={{ ...inpS, width: '50%' }} />
          </div>
        </div>
      ) : (
        <div onClick={() => setFiltersOn(true)} title="Показать фильтры" className="hv-row" style={{ width: 38, flex: 'none', background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '11px 0', display: 'flex', justifyContent: 'center', cursor: 'pointer', color: '#5A625E' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12L9.5 8.5V13l-3-1.5V8.5z" /></svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: '#8A918D' }}>{loading ? 'Загрузка…' : `Всего: ${fmt(total)}`}</div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по операциям" style={{ width: 280, height: 36, border: '1px solid #E0DED8', borderRadius: 9, padding: '0 12px 0 34px', fontSize: 12.5, background: '#fff', outline: 'none' }} />
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#A6ACA8" strokeWidth="1.5" style={{ position: 'absolute', left: 11, top: 10 }}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          </div>
          <div onClick={() => props.openCreate('in')} title="Добавить доход" className="hv-soft" style={{ height: 36, border: '1px solid #E0DED8', borderRadius: 9, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, cursor: 'pointer', color: '#1A7A4B', fontSize: 12.5, fontWeight: 600 }}>+ Доход</div>
          <div onClick={() => props.openCreate('out')} title="Добавить расход" className="hv-soft" style={{ height: 36, border: '1px solid #E0DED8', borderRadius: 9, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, cursor: 'pointer', color: '#B93227', fontSize: 12.5, fontWeight: 600 }}>+ Расход</div>
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
                {view.length === 0 && !loading && (
                  <tr><td colSpan={8} style={{ padding: '16px', fontSize: 12.5, color: '#A6ACA8', textAlign: 'center' }}>По выбранным фильтрам операций нет</td></tr>
                )}
                {view.map((r) => (
                  <tr key={r.key} className="hv-row">
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
                        <span style={{ fontSize: 13, fontWeight: 600, color: r.sumFg, ...num }}>{r.sumMain}<span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}>{r.sumFrac}</span></span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <div onClick={loading ? undefined : () => void load(rows.length)} className="hv-soft" style={{ padding: '11px', textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer', borderTop: '1px solid #F0EFEA' }}>
              {loading ? 'Загрузка…' : `Показать ещё (${fmt(total - rows.length)})`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
