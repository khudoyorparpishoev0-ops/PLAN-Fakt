import { useState, type MouseEvent } from 'react';
import type { Project } from '../data/admin';
import { PRJ_GROUPS } from '../data/admin';
import { api, ApiError, type ProjectPayload } from '../lib/api';
import ProjectForm from './ProjectForm';
import { ACC, PLEX, num } from '../theme';
import { fmt, fmtD, pct1, plural } from '../lib/format';
import { badge, type BadgeData } from '../lib/badges';
import { AccentBtn, Badge, CheckRow, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import ExportDialog from './ExportDialog';

export interface ProjectsScreenProps {
  projects: (Project & { archived: boolean })[];
  toggleArchive: (id: string) => void;
  openProject: (id: string) => void;
  /** Проект создан или изменён — перечитать данные. */
  onSaved: () => void;
  onError: (msg: string) => void;
}

/** Показатель для анализа (ТЗ, п. 3.3). */
type Metric = 'accrual' | 'cash' | 'cashflow';

const METRIC_LABEL: Record<Metric, string> = {
  accrual: 'Прибыль методом начисления',
  cash: 'Прибыль кассовым методом',
  cashflow: 'Движение денег',
};

/** Подписи колонок доходов/расходов/итога под выбранный показатель. */
const METRIC_COLUMNS: Record<Metric, [string, string, string]> = {
  accrual: ['Доходы', 'Расходы', 'Прибыль'],
  cash: ['Поступило', 'Оплачено', 'Прибыль'],
  cashflow: ['Поступления', 'Выплаты', 'Сальдо'],
};

interface Row {
  key: string;
  chev: string; padL: string; fw: number; rowBg: string; sub: string; name: string;
  archived: boolean; b: BadgeData; sd: string; ed: string; inFF: string; outFF: string;
  profF: string; profFg: string; rentF: string; rentFg: string;
  inPF: string; outPF: string; profPF: string;
  open: () => void; menuOpen: boolean;
  menuClick: (e: MouseEvent) => void;
  actEdit: (e: MouseEvent) => void;
  actArch: (e: MouseEvent) => void;
  actDel: (e: MouseEvent) => void;
  archLabel: string;
}

/** Раскладка из дизайн-системы: «Плановый» нейтральный, «В работе» акцентный,
 *  «Завершён» зелёный — та же, что в кабинете (src/data/cabinet.ts). */
const projBadge = (st: Project['status']): BadgeData =>
  st === 'plan' ? badge('Плановый', 'gray') : st === 'work' ? badge('В работе', 'blue') : badge('Завершён', 'green');

export default function ProjectsScreen({ projects, toggleArchive, openProject, onSaved, onError }: ProjectsScreenProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const isMobile = useIsMobile();
  /** Открытая форма проекта: новый или правка существующего. */
  const [form, setForm] = useState<{ id?: number; initial?: Partial<ProjectPayload> } | null>(null);
  const [search, setSearch] = useState('');
  const [projFiltersOn, setProjFiltersOn] = useState(true);
  const [fPlan, setFPlan] = useState(true);
  const [fWork, setFWork] = useState(true);
  const [fDone, setFDone] = useState(true);
  const [fActive, setFActive] = useState(true);
  const [fArch, setFArch] = useState(true);
  const [projView, setProjView] = useState<'flat' | 'groups'>('groups');
  const [grpCol, setGrpCol] = useState<Record<string, boolean>>({});
  const [showPlan, setShowPlan] = useState(false);
  const [projMenu, setProjMenu] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('accrual');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fGroup, setFGroup] = useState('');

  const q = search.trim().toLowerCase();
  const projF = projects.filter(p =>
    (p.status === 'plan' ? fPlan : p.status === 'work' ? fWork : fDone)
    && (p.archived ? fArch : fActive)
    && (!fGroup || p.group === fGroup)
    // Начало не раньше указанной даты, окончание не позже (ТЗ, п. 3.3)
    && (!fStart || (!!p.s && p.s >= fStart))
    && (!fEnd || (!!p.e && p.e <= fEnd))
    && (!q || p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q) || p.resp.toLowerCase().includes(q)));
  const money = (n: number) => (n ? fmt(n) : '—');

  /** Суммы проекта под выбранный показатель: начисление учитывает и
   *  неоплаченные обязательства (плановые операции), касса — только факт. */
  const metricSums = (p: { inF: number; outF: number; inP: number; outP: number }) =>
    metric === 'accrual'
      ? { inc: p.inF + p.inP, exp: p.outF + p.outP }
      : { inc: p.inF, exp: p.outF };

  const removeProject = async (id: string, name: string) => {
    if (!window.confirm(`Удалить проект «${name}»? Действие необратимо.`)) return;
    try {
      await api.removeProject(Number(id));
      onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось удалить проект');
    }
  };

  const mkRow = (p: Project & { archived: boolean }, padL: string, sub: string): Row => {
    const { inc, exp } = metricSums(p);
    const prof = inc - exp, rent = inc ? (prof / inc) * 100 : null;
    return {
      key: p.id, chev: '', padL, fw: 600, rowBg: 'transparent', sub, name: p.name, archived: p.archived, b: projBadge(p.status),
      sd: fmtD(p.s), ed: fmtD(p.e), inFF: money(inc), outFF: money(exp),
      profF: fmt(prof), profFg: prof > 0 ? 'var(--fin-plus)' : prof < 0 ? 'var(--fin-minus)' : 'var(--fin-text-3)',
      rentF: rent == null ? '—' : pct1(rent) + '%', rentFg: rent == null ? 'var(--fin-text-5)' : 'var(--fin-plus)',
      inPF: 'план ' + fmt(p.inP), outPF: 'план ' + fmt(p.outP), profPF: 'план ' + fmt(p.inP - p.outP),
      open: () => { setProjMenu(null); openProject(p.id); },
      menuOpen: projMenu === p.id,
      menuClick: (e) => { e.stopPropagation(); setProjMenu(m => (m === p.id ? null : p.id)); },
      actEdit: (e) => {
        e.stopPropagation();
        setProjMenu(null);
        setForm({
          id: Number(p.id),
          initial: { name: p.name, group: p.group, resp: p.resp, status: p.status, start: p.s ?? '', end: p.e ?? '' },
        });
      },
      actArch: (e) => { e.stopPropagation(); setProjMenu(null); toggleArchive(p.id); },
      archLabel: p.archived ? 'Вернуть из архива' : 'Убрать в архив',
      actDel: (e) => { e.stopPropagation(); setProjMenu(null); void removeProject(p.id, p.name); },
    };
  };

  const projRows: Row[] = [];
  if (projView === 'flat') projF.forEach(p => projRows.push(mkRow(p, '16px', p.group)));
  else PRJ_GROUPS.forEach(g => {
    const kids = projF.filter(p => p.group === g);
    if (!kids.length) return;
    const col = !!grpCol[g];
    const gin = kids.reduce((a, p) => a + metricSums(p).inc, 0);
    const gout = kids.reduce((a, p) => a + metricSums(p).exp, 0);
    const gp = gin - gout;
    const ginP = kids.reduce((a, p) => a + p.inP, 0), goutP = kids.reduce((a, p) => a + p.outP, 0);
    const sts = Array.from(new Set(kids.map(p => p.status)));
    const ss = kids.map(p => p.s).filter((x): x is string => !!x).sort()[0];
    const openEnd = kids.some(p => !p.e && p.status !== 'plan');
    const ee = kids.map(p => p.e).filter((x): x is string => !!x).sort().slice(-1)[0];
    projRows.push({
      key: 'g:' + g, chev: col ? '▸' : '▾', padL: '16px', fw: 700, rowBg: 'var(--fin-surface-alt)', sub: '', name: g + ' (' + kids.length + ')', archived: false,
      b: sts.length === 1 ? projBadge(sts[0]) : badge('Смешанный', 'gray'),
      sd: fmtD(ss), ed: openEnd ? '—' : fmtD(ee), inFF: money(gin), outFF: money(gout),
      profF: fmt(gp), profFg: gp > 0 ? 'var(--fin-plus)' : gp < 0 ? 'var(--fin-minus)' : 'var(--fin-text-3)',
      rentF: gin ? pct1((gp / gin) * 100) + '%' : '—', rentFg: gin ? 'var(--fin-plus)' : 'var(--fin-text-5)',
      inPF: 'план ' + fmt(ginP), outPF: 'план ' + fmt(goutP), profPF: 'план ' + fmt(ginP - goutP),
      open: () => setGrpCol(c => ({ ...c, [g]: !c[g] })),
      menuOpen: false, menuClick: (e) => { e.stopPropagation(); }, actEdit: () => {}, actArch: () => {}, actDel: () => {}, archLabel: '',
    });
    if (!col) kids.forEach(p => projRows.push(mkRow(p, '36px', p.resp)));
  });

  const tIn = projF.reduce((a, p) => a + metricSums(p).inc, 0);
  const tOut = projF.reduce((a, p) => a + metricSums(p).exp, 0);
  const tProf = tIn - tOut;
  const [colInc, colExp, colProf] = METRIC_COLUMNS[metric];

  return (
    <div data-screen-label="Проекты" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'stretch' }}>
      {projMenu != null && <div onClick={() => setProjMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />}
      {projFiltersOn ? (
        <div style={{ width: isMobile ? '100%' : 230, flex: 'none', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Фильтры</div>
            <div onClick={() => setProjFiltersOn(false)} title="Свернуть фильтры" className="hv-cream" style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3L5 7l4 4" /><path d="M3 2.5v9" /></svg>
            </div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', marginBottom: 7 }}>СТАТУС ПРОЕКТА</div>
          <CheckRow on={fPlan} label="Плановый" onClick={() => setFPlan(v => !v)} />
          <CheckRow on={fWork} label="В работе" onClick={() => setFWork(v => !v)} />
          <CheckRow on={fDone} label="Завершён" onClick={() => setFDone(v => !v)} />
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '14px 0 8px' }}>ПАРАМЕТРЫ</div>
          <input type="date" data-proj-start value={fStart} onChange={e => setFStart(e.target.value)} title="Начало проекта не раньше" style={{ width: '100%', height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none', marginBottom: 8, fontFamily: PLEX }} />
          <input type="date" data-proj-end value={fEnd} onChange={e => setFEnd(e.target.value)} title="Окончание проекта не позже" style={{ width: '100%', height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none', marginBottom: 8, fontFamily: PLEX }} />
          <select data-proj-group value={fGroup} onChange={e => setFGroup(e.target.value)} style={{ width: '100%', height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: 'var(--fin-surface)' }}>
            <option value="">Проекты: все</option>
            {PRJ_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {(fStart || fEnd || fGroup) && (
            <div data-proj-reset onClick={() => { setFStart(''); setFEnd(''); setFGroup(''); }} style={{ fontSize: 12, fontWeight: 600, color: ACC, cursor: 'pointer', marginTop: 4 }}>Сбросить параметры</div>
          )}
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '14px 0 7px' }}>АРХИВ</div>
          <CheckRow on={fActive} label="Показать активные" onClick={() => setFActive(v => !v)} />
          <CheckRow on={fArch} label="Показать архивные" onClick={() => setFArch(v => !v)} />
        </div>
      ) : (
        <div onClick={() => setProjFiltersOn(true)} title="Показать фильтры" className="hv-row" style={{ width: 38, flex: 'none', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '11px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--fin-text-2)' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12L9.5 8.5V13l-3-1.5V8.5z" /></svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <AccentBtn style={{ padding: '8px 15px' }} onClick={() => setForm({})}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Проект</AccentBtn>
          <select data-proj-metric value={metric} onChange={e => setMetric(e.target.value as Metric)} title="Показатель для анализа" style={{ height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: 'var(--fin-surface)', color: 'var(--fin-text)', fontWeight: 500 }}>
            {(Object.keys(METRIC_LABEL) as Metric[]).map(m => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          </select>
          <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2 }}>
            <div onClick={() => setProjView('flat')} title="По проектам" style={{ width: 32, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: projView === 'flat' ? 'var(--fin-surface)' : 'transparent', boxShadow: projView === 'flat' ? '0 1px 2px rgba(0,0,0,.08)' : 'none', color: 'var(--fin-text-2)' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5h10M2 7h10M2 10.5h10" /></svg></div>
            <div onClick={() => setProjView('groups')} title="По группам проектов" style={{ width: 32, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: projView === 'groups' ? 'var(--fin-surface)' : 'transparent', boxShadow: projView === 'groups' ? '0 1px 2px rgba(0,0,0,.08)' : 'none', color: 'var(--fin-text-2)' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h10" /><path d="M5 7h7M5 11h7" /><path d="M2.5 5v6" /></svg></div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по проектам" style={{ flex: 1, minWidth: 150, maxWidth: 260, height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 12px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none' }} />
          <div style={{ flex: 1 }} />
          <div onClick={() => setShowPlan(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ width: 34, height: 20, borderRadius: 99, background: showPlan ? ACC : 'var(--fin-border)', position: 'relative', flex: 'none' }}><span style={{ position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--fin-surface)', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transform: `translateX(${showPlan ? '14px' : '0px'})`, transition: 'transform .15s' }} /></span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)' }}>Показывать план</span>
          </div>
          <div onClick={() => setExportOpen(true)} title="Скачать проекты.xlsx" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 2v7M4.5 6.5L7 9l2.5-2.5" /><path d="M2.5 12h9" /></svg>Excel</div>
        </div>
        <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '8px 12px 8px 16px', cursor: 'pointer' }}>Проект ▾</Th>
              <Th right>Начало · Конец</Th>
              <Th>Статус</Th>
              <Th right>{colInc}</Th>
              <Th right>{colExp}</Th>
              <Th right>{colProf}</Th>
              <Th right>{metric === 'cashflow' ? '' : 'Рентаб.'}</Th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--fin-border)', width: 34 }} />
            </tr></thead>
            <tbody>
            {projRows.map(r => (
              <tr key={r.key} onClick={r.open} className="hv-row" style={{ cursor: 'pointer', background: r.rowBg }}>
                <td style={{ padding: '9px 12px', paddingLeft: r.padL, borderBottom: '1px solid var(--fin-divider)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, color: 'var(--fin-text-5)', fontSize: 10, flex: 'none' }}>{r.chev}</span>
                    <span style={{ fontSize: 13, fontWeight: r.fw }}>{r.name}</span>
                    {r.archived && <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, color: 'var(--fin-text-3)', background: 'var(--fin-divider)', borderRadius: 99, padding: '1px 8px' }}>Архив</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginLeft: 18 }}>{r.sub}</div>
                </td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', whiteSpace: 'nowrap' }}><div style={{ fontSize: 12.5, fontFamily: PLEX }}>{r.sd}</div><div style={{ fontSize: 11.5, color: 'var(--fin-text-5)', fontFamily: PLEX }}>{r.ed}</div></td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--fin-divider)' }}><Badge b={r.b} /></td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', fontSize: 13, fontWeight: r.fw, ...num, whiteSpace: 'nowrap' }}>{r.inFF}{showPlan && <div style={{ fontSize: 11, color: 'var(--fin-text-5)', fontWeight: 400 }}>{r.inPF}</div>}</td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', fontSize: 13, fontWeight: r.fw, ...num, whiteSpace: 'nowrap' }}>{r.outFF}{showPlan && <div style={{ fontSize: 11, color: 'var(--fin-text-5)', fontWeight: 400 }}>{r.outPF}</div>}</td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', fontSize: 13, fontWeight: 600, color: r.profFg, ...num, whiteSpace: 'nowrap' }}>{r.profF}{showPlan && <div style={{ fontSize: 11, color: 'var(--fin-text-5)', fontWeight: 400 }}>{r.profPF}</div>}</td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: r.rentFg, ...num, whiteSpace: 'nowrap' }}>{r.rentF}</td>
                <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--fin-divider)', position: 'relative' }}>
                  <div onClick={r.menuClick} data-proj-row-menu className="hv-cream" style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}><svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="7" cy="11.5" r="1.2" /></svg></div>
                  {r.menuOpen && (
                    <div data-proj-menu style={{ position: 'absolute', right: 34, top: 30, zIndex: 40, background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,.14)', padding: 5, minWidth: 190 }}>
                      <div onClick={r.actEdit} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--fin-text-3)" strokeWidth="1.4"><path d="M9.5 2l2.5 2.5L5 11.5H2.5V9z" /></svg>Редактировать</div>
                      <div onClick={r.actArch} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--fin-text-3)" strokeWidth="1.4"><rect x="1.5" y="2" width="11" height="3" rx="1" /><path d="M2.5 5v6a1.5 1.5 0 001.5 1.5h6A1.5 1.5 0 0011.5 11V5" /><path d="M5.5 8h3" /></svg>{r.archLabel}</div>
                      <div onClick={r.actDel} className="hv-red" style={{ padding: '8px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', color: 'var(--fin-minus)', display: 'flex', alignItems: 'center', gap: 8 }}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--fin-minus)" strokeWidth="1.4"><path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.5 3.5l.7 8A1.5 1.5 0 005.7 13h2.6a1.5 1.5 0 001.5-1.4l.7-8.1" /></svg>Удалить</div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '10px 16px', borderTop: '1px solid var(--fin-border)', background: 'var(--fin-surface-alt)', fontSize: 12.5, alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>{plural(projF.length)}</span>
            <span style={{ color: 'var(--fin-text-3)' }}>{colInc}: <b style={{ color: 'var(--fin-text)', ...num }}>{fmt(tIn)}</b></span>
            <span style={{ color: 'var(--fin-text-3)' }}>{colExp}: <b style={{ color: 'var(--fin-text)', ...num }}>{fmt(tOut)}</b></span>
            <span style={{ color: 'var(--fin-text-3)' }}>{colProf}: <b style={{ color: 'var(--fin-plus)', ...num }}>{fmt(tProf)}</b></span>
            {metric !== 'cashflow' && (
              <span style={{ color: 'var(--fin-text-3)' }}>Рентабельность: <b style={{ color: 'var(--fin-plus)', ...num }}>{tIn ? pct1((tProf / tIn) * 100) + '%' : '—'}</b></span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>
          Нажмите строку — откроется карточка проекта. Дата начала — первая операция по проекту, дата окончания — последняя.
          Итоги в нижней строке считаются по выбранным фильтрам.{' '}
          {metric === 'accrual'
            ? 'Метод начисления учитывает и неоплаченные обязательства — плановые операции проекта.'
            : 'Кассовый метод и движение денег считаются только по подтверждённым платежам.'}
          {' '}Удалить можно лишь проект без операций, планов, заявок, задач и сделок — остальные убираются в архив.
        </div>
      </div>
      {form && (
        <ProjectForm
          id={form.id}
          initial={form.initial}
          groups={PRJ_GROUPS}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); onSaved(); }}
        />
      )}

      {exportOpen && <ExportDialog kind="projects" onClose={() => setExportOpen(false)} />}
    </div>
  );
}
