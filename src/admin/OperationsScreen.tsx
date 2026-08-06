import { useEffect, useMemo, useRef, useState } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt } from '../lib/format';
import { api, ApiError, type ApiDictionaries, type ApiOperation, type ApiProject, type OperationQuery } from '../lib/api';
import { ruDate } from '../lib/mapping';
import { CheckRow, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import { BASE_CURRENCY } from '../lib/currency';
import OperationCard from './OperationCard';
import ExportDialog from './ExportDialog';
import { EmptyState, ErrorState, SkeletonTable } from '../components/states';

const PAGE = 50;

/** Колонки, которые можно скрыть (ТЗ, п. 3.2 — «⋯ → настройка колонок»). */
const OPTIONAL_COLUMNS = [
  { key: 'account', label: 'Счёт' },
  { key: 'type', label: 'Тип' },
  { key: 'party', label: 'Контрагент' },
  { key: 'article', label: 'Статья' },
  { key: 'project', label: 'Проект' },
] as const;
type ColKey = typeof OPTIONAL_COLUMNS[number]['key'];

const LS_FILTERS = 'ithona.ops.filtersOpen';
const LS_COLUMNS = 'ithona.ops.columns';

/** Состояние панели фильтров запоминается на пользователя (ТЗ, п. 3.2). */
const loadFiltersOpen = (): boolean => {
  try { return localStorage.getItem(LS_FILTERS) !== '0'; } catch { return true; }
};
const loadColumns = (): Record<ColKey, boolean> => {
  const all = Object.fromEntries(OPTIONAL_COLUMNS.map(c => [c.key, true])) as Record<ColKey, boolean>;
  try {
    const raw = localStorage.getItem(LS_COLUMNS);
    return raw ? { ...all, ...(JSON.parse(raw) as Partial<Record<ColKey, boolean>>) } : all;
  } catch {
    return all;
  }
};

export interface OperationsScreenProps {
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  /** Открыть форму добавления операции (доход/расход). */
  openCreate: (kind: 'in' | 'out') => void;
  /** Растёт при каждом добавлении операции — сигнал перезагрузить список. */
  refreshTick: number;
  /** Данные журнала изменились — обновить панель и план-факт. */
  onChanged?: () => void;
  onError: (msg: string) => void;
}

const selS: React.CSSProperties = { width: '100%', height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: 'var(--fin-surface)', color: 'var(--fin-text-2)', marginBottom: 8, outline: 'none' };
const inpS: React.CSSProperties = { height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none' };
const cellS: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 };
/** Сумма — самая важная колонка: при горизонтальной прокрутке остаётся на виду. */
const stickySum: React.CSSProperties = {
  position: 'sticky', right: 0, background: 'var(--fin-surface)',
  boxShadow: '-6px 0 8px -6px rgba(0,0,0,.12)',
};

/** Квадратный чекбокс строки/шапки. */
function Box({ on, half, onClick }: { on: boolean; half?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        verticalAlign: 'middle', cursor: 'pointer', flex: 'none',
        border: `1.5px solid ${on || half ? ACC : 'var(--fin-border)'}`, background: on || half ? ACC : 'var(--fin-surface)', color: 'var(--fin-surface)',
      }}
    >
      {on && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.2l2.4 2.4L9.5 3.8" /></svg>}
      {!on && half && <span style={{ width: 8, height: 2, background: 'var(--fin-surface)', borderRadius: 1 }} />}
    </span>
  );
}

/** Журнал операций: данные и фильтры — серверные (GET /api/operations,
 *  ТЗ п. 9: комбинируемые фильтры, лимит/оффсет). */
export default function OperationsScreen(props: OperationsScreenProps) {
  const { dicts, projects } = props;
  const isMobile = useIsMobile();
  const [filtersOn, setFiltersOn] = useState(loadFiltersOpen);
  const [columns, setColumns] = useState<Record<ColKey, boolean>>(loadColumns);
  const [menu, setMenu] = useState(false);
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
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulkProject, setBulkProject] = useState('');
  const [cardId, setCardId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /** Ошибка загрузки журнала — гасим таблицу, а не весь экран. */
  const [failure, setFailure] = useState<string | null>(null);
  const seq = useRef(0);

  const toggleType = (k: keyof typeof opType) => setOpType(st => ({ ...st, [k]: !st[k] }));
  const togglePay = (k: keyof typeof payConf) => setPayConf(st => ({ ...st, [k]: !st[k] }));

  const setFilters = (on: boolean) => {
    setFiltersOn(on);
    try { localStorage.setItem(LS_FILTERS, on ? '1' : '0'); } catch { /* приватный режим — не критично */ }
  };
  const toggleColumn = (k: ColKey) => {
    setColumns(c => {
      const next = { ...c, [k]: !c[k] };
      try { localStorage.setItem(LS_COLUMNS, JSON.stringify(next)); } catch { /* не критично */ }
      return next;
    });
  };

  // Поиск с задержкой, чтобы не дёргать сервер на каждый символ
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Меню «⋯» закрывается по Escape
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  /* Пустой результат под фильтрами и пустая база — разные состояния:
     в первом случае предлагаем сбросить фильтры, во втором — завести
     первую операцию. */
  const filtersApplied =
    !(opType.in && opType.out && opType.move && opType.accr)
    || payConf.conf !== payConf.unconf
    || !!dateFrom || !!dateTo || !!fAccount || !!fParty || !!fArticle || !!fProject
    || !!sumMin.trim() || !!sumMax.trim() || !!q;

  const resetFilters = () => {
    setOpType({ in: true, out: true, move: true, accr: true });
    setPayConf({ conf: true, unconf: true });
    setDateFrom(''); setDateTo('');
    setFAccount(''); setFParty(''); setFArticle(''); setFProject('');
    setSumMin(''); setSumMax(''); setSearch('');
  };

  const buildQuery = (offset: number): OperationQuery => {
    const types: ('in' | 'out' | 'move' | 'accrual')[] = [];
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
      setFailure(null);
    } catch (e) {
      // Гасим только таблицу: фильтры и кнопки человеку ещё нужны
      if (my === seq.current) setFailure(e instanceof ApiError ? e.message : String(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    setSel(new Set());
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
      iso: o.date,
      date: ruDate(o.date), account: o.account ?? '—', dirIn: o.type === 'in',
      party: o.party ?? '—', article: o.article ?? '—', sub: o.comment ?? '', project: o.project ?? '—',
      // Плановые операции (из одобренных заявок) помечаются в журнале тегом «План»
      tag: o.isPlan ? 'План' : o.type === 'in' ? 'Доходы' : 'Расходы',
      sumMain: sign + fmt(whole),
      sumFrac: ',' + String(dirams).padStart(2, '0') + ' TJS',
      // Журнал считается в сомони; валютная операция подписывается исходной
      // суммой, иначе «−1 100 TJS» у платежа в 100 USD выглядит опечаткой
      sumOrig: o.currency && o.currency !== BASE_CURRENCY ? `${fmt(o.amountOriginal)} ${o.currency}` : null,
      sumFg: o.type === 'in' ? 'var(--fin-plus)' : 'var(--fin-minus)',
    };
  });

  /* ── Группировка «Сегодня» / «Вчера и ранее» (ТЗ, п. 3.2) ── */
  const today = new Date().toISOString().slice(0, 10);
  const groups = useMemo(() => {
    const todayRows = view.filter(r => r.iso === today);
    const earlier = view.filter(r => r.iso !== today);
    return { todayRows, earlier };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  const colCount = 3 + OPTIONAL_COLUMNS.filter(c => columns[c.key]).length; // чекбокс + дата + сумма

  const allOnPage = view.length > 0 && view.every(r => sel.has(r.key));
  const someOnPage = view.some(r => sel.has(r.key));
  const toggleAll = () => {
    setSel(s => {
      const next = new Set(s);
      if (allOnPage) view.forEach(r => next.delete(r.key));
      else view.forEach(r => next.add(r.key));
      return next;
    });
  };
  const toggleOne = (id: number) => setSel(s => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /** Массовое действие: подтвердить, удалить, сменить проект. */
  const bulk = async (action: 'confirm' | 'delete' | 'project') => {
    const ids = [...sel];
    if (!ids.length) return;
    if (action === 'delete' && !window.confirm(`Удалить операций: ${ids.length}?`)) return;
    if (action === 'project' && !bulkProject) return;
    try {
      const res = await api.bulkOperations(ids, action, action === 'project' ? Number(bulkProject) : undefined);
      setSel(new Set());
      setBulkProject('');
      await load(0);
      props.onChanged?.();
      setFlash(
        res.skipped > 0
          ? `Обработано: ${res.updated}. Пропущено операций из заявок: ${res.skipped} — их можно только сторнировать.`
          : `Обработано операций: ${res.updated}.`,
      );
      setTimeout(() => setFlash(null), 6000);
    } catch (e) {
      props.onError(e instanceof ApiError ? e.message : 'Не удалось выполнить действие');
    }
  };

  // Выгрузка идёт через диалог: состав колонок выбирается перед скачиванием,
  // фильтры экрана уходят в файл и на лист «Параметры».
  const exportXlsx = () => { setMenu(false); setExportOpen(true); };

  const th = (key: ColKey, label: string, extra?: React.CSSProperties) =>
    columns[key] ? <Th style={{ padding: '9px 12px', ...extra }}>{label}</Th> : null;

  return (
    <div data-screen-label="Операции" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'stretch' }}>
      {filtersOn ? (
        <div style={{ width: isMobile ? '100%' : 236, flex: 'none', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Фильтры</div>
            <div onClick={() => setFilters(false)} title="Свернуть фильтры" className="hv-cream" style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: ACC }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3L5 7l4 4" /><path d="M3 2.5v9" /></svg>
            </div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', marginBottom: 7 }}>ТИП ОПЕРАЦИИ</div>
          {opTypeChecks.map(([t, on, fn]) => <CheckRow key={t} on={on} label={t} onClick={fn} />)}
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '14px 0 7px' }}>ДАТА ОПЛАТЫ</div>
          {payChecks.map(([t, on, fn]) => <CheckRow key={t} on={on} label={t} onClick={fn} />)}
          <div style={{ display: 'flex', gap: 8, margin: '9px 0 0' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Период с" style={{ ...inpS, width: '50%', padding: '0 6px' }} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Период по" style={{ ...inpS, width: '50%', padding: '0 6px' }} />
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '16px 0 8px' }}>ПАРАМЕТРЫ</div>
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
        <div onClick={() => setFilters(true)} title="Показать фильтры" className="hv-row" style={{ width: 38, flex: 'none', alignSelf: 'flex-start', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '11px 0', display: 'flex', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12L9.5 8.5V13l-3-1.5V8.5z" /></svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>{loading ? 'Загрузка…' : `Всего: ${fmt(total)}`}</div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по операциям" style={{ width: isMobile ? '100%' : 280, height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, padding: '0 12px 0 34px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none' }} />
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--fin-text-5)" strokeWidth="1.5" style={{ position: 'absolute', left: 11, top: 10 }}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          </div>
          <div onClick={() => props.openCreate('in')} title="Добавить доход" className="hv-soft" style={{ height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, cursor: 'pointer', color: 'var(--fin-plus)', fontSize: 12.5, fontWeight: 600 }}>+ Доход</div>
          <div onClick={() => props.openCreate('out')} title="Добавить расход" className="hv-soft" style={{ height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, cursor: 'pointer', color: 'var(--fin-minus)', fontSize: 12.5, fontWeight: 600 }}>+ Расход</div>
          <div style={{ position: 'relative' }}>
            <div onClick={() => setMenu(v => !v)} title="Ещё" data-ops-menu className="hv-soft" style={{ width: 36, height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)', background: menu ? 'var(--fin-hover)' : 'var(--fin-surface)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="2.5" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="11.5" cy="7" r="1.2" /></svg>
            </div>
            {menu && (
              <>
                <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
                <div data-ops-menu-panel style={{ position: 'absolute', right: 0, top: 42, zIndex: 40, width: 220, background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,.14)', padding: 6 }}>
                  <div onClick={exportXlsx} className="hv-soft" style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Экспорт в Excel</div>
                  <div style={{ borderTop: '1px solid var(--fin-divider)', margin: '5px 0', padding: '7px 10px 3px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--fin-text-5)' }}>КОЛОНКИ</div>
                  {OPTIONAL_COLUMNS.map(c => (
                    <div key={c.key} onClick={() => toggleColumn(c.key)} className="hv-soft" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}>
                      <Box on={columns[c.key]} onClick={e => { e.stopPropagation(); toggleColumn(c.key); }} />
                      {c.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {flash && (
          <div style={{ background: 'var(--fin-plus-soft)', border: '1px solid var(--fin-plus-soft)', color: 'var(--fin-plus)', borderRadius: 10, padding: '9px 13px', fontSize: 12.5, marginBottom: 10 }}>{flash}</div>
        )}

        {/* Ошибка гасит только список: фильтры и кнопки человеку ещё нужны */}
        {failure && (
          <div style={{ marginBottom: 10 }}>
            <ErrorState
              title="Журнал не загрузился"
              reassure="Данные на месте — не отобразился только список. Фильтры и настройки сохранены."
              detail={failure}
              onRetry={() => { setFailure(null); void load(0); }}
            />
          </div>
        )}

        {sel.size > 0 && (
          <div data-bulk-bar style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--fin-surface)', border: '1px solid ' + ACC, borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Выбрано: {sel.size}</span>
            <div onClick={() => void bulk('confirm')} className="hv-dim" style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Подтвердить оплату</div>
            <select value={bulkProject} onChange={e => setBulkProject(e.target.value)} style={{ height: 32, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: 'var(--fin-surface)' }}>
              <option value="">Сменить проект…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div onClick={() => void bulk('project')} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: bulkProject ? 'var(--fin-text-2)' : 'var(--fin-text-5)', cursor: bulkProject ? 'pointer' : 'default' }}>Перенести</div>
            <div onClick={() => void bulk('delete')} className="hv-soft" style={{ border: '1px solid var(--fin-minus-soft)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-minus)', cursor: 'pointer' }}>Удалить</div>
            <div style={{ flex: 1 }} />
            <span onClick={() => setSel(new Set())} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>Снять выделение</span>
          </div>
        )}

        {rows.length === 0 && loading && !failure ? <SkeletonTable rows={7} cols={6} /> : (
        <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ padding: '9px 10px 9px 16px', width: 20, borderBottom: '1px solid var(--fin-border)' }}>
                  <Box on={allOnPage} half={!allOnPage && someOnPage} onClick={toggleAll} />
                </th>
                <Th style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>Дата ▾</Th>
                {th('account', 'Счёт')}
                {th('type', 'Тип', { textAlign: 'center', padding: '9px 8px' })}
                {th('party', 'Контрагент')}
                {th('article', 'Статья')}
                {th('project', 'Проект')}
                <Th right style={{ padding: '9px 16px 9px 12px', ...stickySum, background: 'var(--fin-surface)', zIndex: 2 }}>Сумма</Th>
              </tr></thead>
              <tbody>
                {view.length === 0 && !loading && (
                  <tr><td colSpan={colCount} style={{ padding: 0 }}>
                    {filtersApplied
                      ? <EmptyState
                          tone="neutral"
                          title="Под фильтры ничего не подошло"
                          text="Данные есть, но не в этой выборке. Снимите часть условий или расширьте период."
                          action="Сбросить фильтры" onAction={resetFilters}
                          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>}
                        />
                      : <EmptyState
                          title="Операций пока нет"
                          text="Первая операция появится здесь, как только её проведут. Можно завести вручную."
                          action="Добавить расход" onAction={() => props.openCreate('out')}
                        />}
                  </td></tr>
                )}
                {view.length > 0 && (
                  <>
                    <tr><td colSpan={colCount} style={{ padding: '7px 16px', background: 'var(--fin-surface-alt)', borderBottom: '1px solid var(--fin-divider)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--fin-text-4)' }}>
                      {groups.todayRows.length ? 'СЕГОДНЯ' : 'СЕГОДНЯ НЕТ ОПЕРАЦИЙ'}
                    </td></tr>
                    {groups.todayRows.map(r => opRow(r))}
                    {groups.earlier.length > 0 && (
                      <tr><td colSpan={colCount} style={{ padding: '7px 16px', background: 'var(--fin-surface-alt)', borderBottom: '1px solid var(--fin-divider)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--fin-text-4)' }}>ВЧЕРА И РАНЕЕ</td></tr>
                    )}
                    {groups.earlier.map(r => opRow(r))}
                  </>
                )}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <div onClick={loading ? undefined : () => void load(rows.length)} className="hv-soft" style={{ padding: '11px', textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer', borderTop: '1px solid var(--fin-divider)' }}>
              {loading ? 'Загрузка…' : `Показать ещё (${fmt(total - rows.length)})`}
            </div>
          )}
        </div>
        )}
      </div>

      {cardId != null && (
        <OperationCard
          id={cardId}
          projects={projects}
          onClose={() => setCardId(null)}
          onChanged={() => { void load(0); props.onChanged?.(); }}
          onError={props.onError}
        />
      )}

      {exportOpen && (
        <ExportDialog
          kind="operations" query={buildQuery(0)} rowCount={total}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );

  /** Строка журнала: клик открывает карточку, чекбокс — выделение. */
  function opRow(r: typeof view[number]) {
    return (
      <tr key={r.key} onClick={() => setCardId(r.key)} className="hv-row" style={{ cursor: 'pointer', background: sel.has(r.key) ? 'var(--fin-surface-alt)' : undefined }}>
        <td style={{ padding: '10px 10px 10px 16px', borderBottom: '1px solid var(--fin-divider)' }}>
          <Box on={sel.has(r.key)} onClick={e => { e.stopPropagation(); toggleOne(r.key); }} />
        </td>
        <td style={{ ...cellS, color: 'var(--fin-text-2)', whiteSpace: 'nowrap', fontFamily: PLEX }}>{r.date}</td>
        {columns.account && <td style={{ ...cellS, color: 'var(--fin-text-2)', whiteSpace: 'nowrap' }}>{r.account}</td>}
        {columns.type && (
          <td style={{ ...cellS, padding: '10px 8px', textAlign: 'center' }}>
            {r.dirIn
              ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--fin-plus)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8H3" /><path d="M6.5 4.5L3 8l3.5 3.5" /></svg>
              : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--fin-minus)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10" /><path d="M9.5 4.5L13 8l-3.5 3.5" /></svg>}
          </td>
        )}
        {columns.party && <td style={{ ...cellS, whiteSpace: 'nowrap' }}>{r.party}</td>}
        {columns.article && (
          <td style={cellS}>
            <div style={{ fontWeight: 600, color: 'var(--fin-text)' }}>{r.article} <span style={{ fontWeight: 500, color: 'var(--fin-text-5)' }}>[{r.tag}]</span></div>
            {r.sub && <div style={{ fontSize: 11.5, color: 'var(--fin-text-5)', marginTop: 1 }}>{r.sub}</div>}
          </td>
        )}
        {columns.project && <td style={{ ...cellS, color: 'var(--fin-text-2)', whiteSpace: 'nowrap' }}>{r.project}</td>}
        <td style={{ ...cellS, padding: '10px 16px 10px 12px', textAlign: 'right', whiteSpace: 'nowrap', ...stickySum, background: sel.has(r.key) ? 'var(--fin-surface-alt)' : 'var(--fin-surface)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            {r.sub && (
              <span title={r.sub} style={{ color: 'var(--fin-text-5)', display: 'inline-flex' }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: r.sumFg, ...num }}>{r.sumMain}<span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--fin-text-5)' }}>{r.sumFrac}</span></span>
            {r.sumOrig && <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--fin-text-5)', ...num }}>{r.sumOrig}</div>}
          </span>
        </td>
      </tr>
    );
  }
}
