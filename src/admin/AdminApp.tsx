import { useEffect, useMemo, useState } from 'react';
import { ACC, applyThemeVars, num } from '../theme';
import type { Expense, Income, Project } from '../data/admin';
import { computeTotals, initials } from '../lib/compute';
import {
  api, ApiError, ROLE_LABELS,
  type ApiAssignee, type ApiDictionaries, type ApiMetrics, type ApiProject, type ApiRequest, type AuthUser,
} from '../lib/api';
import { toExpense, toIncome } from '../lib/mapping';
import { DEFAULT_PERIOD, periodRange, type PeriodKind } from '../lib/period';
import { TAP, useIsMobile } from '../lib/responsive';
import { expRow } from '../lib/rows';
import { Logo } from '../components/ui';
import NotifyBell from '../components/NotifyBell';
import PanelScreen from './PanelScreen';
import OperationsScreen from './OperationsScreen';
import ExpensesScreen from './ExpensesScreen';
import ReportScreen from './ReportScreen';
import ProjectsScreen from './ProjectsScreen';
import SpravScreen from './SpravScreen';
import SettingsScreen from './SettingsScreen';
import DealsScreen from './DealsScreen';
import TasksScreen from './TasksScreen';
import PlanningScreen from './PlanningScreen';
import StockScreen from './StockScreen';
import ClientsScreen from './ClientsScreen';
import MobileView from './MobileView';
import IncomeDrawer from './IncomeDrawer';
import ApprovalsScreen from './ApprovalsScreen';
import ExpenseDrawer from './ExpenseDrawer';
import ProjectDrawer from './ProjectDrawer';

export type Screen =
  | 'panel' | 'incomes' | 'expenses' | 'report' | 'sprav' | 'settings' | 'projects' | 'deals'
  | 'tasks' | 'planning' | 'stock' | 'clients' | 'approvals';

const TITLES: Record<Screen, string> = {
  panel: 'Финансовая панель', incomes: 'Операции', expenses: 'Операции · Расходы',
  report: 'Отчёт «План–Факт»', sprav: 'Справочники', settings: 'Настройки',
  projects: 'Проекты', deals: 'Сделки по закупкам',
  tasks: 'Задачи', planning: 'Планирование', stock: 'Склад', clients: 'Клиенты и поставщики',
  approvals: 'Заявки на утверждение',
};

/** Пункт бокового меню. */
function NavItem({ label, icon, active, disabled, badge, onClick }: {
  label: string; icon: JSX.Element; active?: boolean; disabled?: boolean;
  /** Счётчик справа (очередь заявок); 0 не показывается. */
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      title={disabled ? 'Появится на этапе 2' : undefined}
      data-nav={label}
      className={!disabled && !active ? 'hv-side' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, height: 38, margin: '1px 10px', padding: '0 12px',
        borderRadius: 9, cursor: disabled ? 'default' : 'pointer',
        background: active ? ACC : 'transparent',
        color: disabled ? 'rgba(255,255,255,.4)' : active ? 'var(--fin-surface)' : 'rgba(255,255,255,.82)',
      }}
    >
      {icon}
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
      {!!badge && (
        <span style={{
          marginLeft: 'auto', minWidth: 20, height: 19, padding: '0 6px', borderRadius: 99,
          ...num, fontSize: 11, fontWeight: 700, lineHeight: '19px', textAlign: 'center',
          background: active ? 'rgba(255,255,255,.22)' : 'var(--fin-minus)', color: 'var(--fin-surface)',
        }}>{badge}</span>
      )}
    </div>
  );
}

const SectionLabel = ({ children, pt = 14 }: { children: string; pt?: number }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', color: 'rgba(255,255,255,.4)', padding: `${pt}px 22px 6px` }}>{children}</div>
);

const I = {
  approve: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M5.5 8.2l1.9 1.9L11 6.4" /></svg>,
  pf: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="9" width="3" height="5" rx="1" /><rect x="6.5" y="5.5" width="3" height="8.5" rx="1" /><rect x="11" y="2.5" width="3" height="11.5" rx="1" /></svg>,
  pok: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 11.5a5.5 5.5 0 1111 0" /><path d="M8 11.5l2.8-2.4" /><circle cx="8" cy="11.5" r="1.1" fill="currentColor" stroke="none" /></svg>,
  ops: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5h10" /><path d="M9.5 2.8l3 2.7-3 2.7" /><path d="M13.5 10.5h-10" /><path d="M6.5 7.8l-3 2.7 3 2.7" /></svg>,
  tasks: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2.5" width="10" height="11.5" rx="1.8" /><rect x="5.5" y="1" width="5" height="3" rx="1" /><path d="M5.8 8l1.6 1.6 3-3.3" /></svg>,
  plan: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>,
  prj: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="12" height="8.5" rx="1.8" /><path d="M6 5V3.8A1.3 1.3 0 017.3 2.5h1.4A1.3 1.3 0 0110 3.8V5" /><path d="M2 8.7h12" /></svg>,
  deals: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="13.5" r="1" /><circle cx="12" cy="13.5" r="1" /><path d="M1.5 2h2l1.5 8.5h7L14 5H4.2" /></svg>,
  store: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.8l5.5 3v6.4L8 14.2 2.5 11.2V4.8z" /><path d="M2.6 4.9L8 8l5.4-3.1M8 8v6.2" /></svg>,
  clients: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="10" height="12" rx="1.2" /><path d="M5.6 5h1.4M9 5h1.4M5.6 8h1.4M9 8h1.4M6 14v-2.2h4V14" /></svg>,
  sprav: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 4C6.9 3 5.2 2.8 2.5 2.8v9.7c2.7 0 4.4.2 5.5 1.2 1.1-1 2.8-1.2 5.5-1.2V2.8C10.8 2.8 9.1 3 8 4z" /><path d="M8 4v9.7" /></svg>,
  users: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="2.3" /><path d="M1.8 13a4.2 4.2 0 018.4 0" /><path d="M10.5 4.2a2.3 2.3 0 010 4.3M11.2 13a4.2 4.2 0 00-1.4-3.1" /></svg>,
  set: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.6 3.6l1.35 1.35M11.05 11.05l1.35 1.35M12.4 3.6l-1.35 1.35M4.95 11.05L3.6 12.4" /></svg>,
};

export interface AdminAppProps {
  user?: AuthUser;
  onLogout?: () => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
}

/** Проект API → форма Project экрана «Проекты» (id — строка, суммы 0 без прав). */
const toProject = (p: ApiProject): Project & { archived: boolean } => ({
  id: String(p.id),
  name: p.name,
  group: p.group,
  status: p.status,
  archived: p.archived,
  s: p.start,
  e: p.end,
  inF: p.inF ?? 0,
  outF: p.outF ?? 0,
  inP: p.inP ?? 0,
  outP: p.outP ?? 0,
  resp: p.resp,
});

export default function AdminApp({ user, onLogout, onChangePassword }: AdminAppProps) {
  const [screen, setScreen] = useState<Screen>('panel');
  const [setTab, setSetTab] = useState('profile');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [expStatuses, setExpStatuses] = useState<Record<string, string>>({});
  const [selExp, setSelExp] = useState<number | null>(null);
  const [opDrawer, setOpDrawer] = useState<'in' | 'out' | null>(null);
  const [selProj, setSelProj] = useState<string | null>(null);

  /* ── Данные с API: план-факт, заявки, проекты, справочники.
   *    Журнал операций сам грузит OperationsScreen (серверные фильтры);
   *    opsTick — сигнал ему перечитать список после изменений. ── */
  const [incomesRaw, setIncomesRaw] = useState<Income[]>([]);
  const [expensesRaw, setExpensesRaw] = useState<Expense[]>([]);
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [requests, setRequests] = useState<ApiRequest[]>([]);
  const [apiProjects, setApiProjects] = useState<ApiProject[]>([]);
  const [dicts, setDicts] = useState<ApiDictionaries | null>(null);
  const [assignees, setAssignees] = useState<ApiAssignee[]>([]);
  const [opsTick, setOpsTick] = useState(0);
  const [notifyTick, setNotifyTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Отчётный период — общий для панели, расходов и отчёта. */
  const [period, setPeriod] = useState<PeriodKind>(DEFAULT_PERIOD);
  const range = useMemo(() => periodRange(period), [period]);

  useEffect(() => { applyThemeVars(); }, []);

  const loadData = async () => {
    const [pf, reqs, projs] = await Promise.all([
      api.planFact({ from: range.from, to: range.to }), api.requests(), api.projects(),
    ]);
    setIncomesRaw(pf.incomes.map(toIncome));
    setExpensesRaw(pf.expenses.map(toExpense));
    setMetrics(pf.metrics);
    setRequests(reqs);
    setApiProjects(projs);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadData();
        if (!dicts) {
          const d = await api.dictionaries();
          if (alive) setDicts(d);
        }
        if (!assignees.length) {
          // Список исполнителей нужен «Задачам»; бухгалтеру он недоступен (403)
          const a = await api.assignees().catch(() => ({ items: [] as ApiAssignee[] }));
          if (alive) setAssignees(a.items);
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  /** Перечитать справочники (после правки в «Справочниках»). */
  const reloadDicts = () => { void api.dictionaries().then(setDicts).catch(() => {}); };

  const expenses: Expense[] = useMemo(
    () => expensesRaw.map(e => ({ ...e, status: expStatuses[e.n] ?? e.status })),
    [expensesRaw, expStatuses],
  );
  const totals = useMemo(() => computeTotals(incomesRaw, expenses, metrics), [incomesRaw, expenses, metrics]);
  const projects = useMemo(() => apiProjects.map(toProject), [apiProjects]);

  /** Заявки, ждущие решения (Отправлено / На рассмотрении) — «Требует внимания». */
  const pendingReqs = useMemo(
    () => requests.filter(r => r.status === 'sent' || r.status === 'review'),
    [requests],
  );

  /** Решение по заявке: PATCH статуса + перезагрузка данных (одобрение
   *  создаёт плановую операцию — обновляются журнал и план-факт). */
  const decideRequest = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await api.changeRequestStatus(id, status);
      await loadData();
      setOpsTick(t => t + 1);
      setNotifyTick(t => t + 1);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Не удалось изменить статус заявки');
    }
  };

  /** Сторнирование одобренной заявки (шторка строки «План · заявка …»). */
  const stornoRequest = async (requestId: number) => {
    try {
      await api.stornoRequest(requestId);
      setSelExp(null);
      await loadData();
      setOpsTick(t => t + 1);
      setNotifyTick(t => t + 1);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Не удалось сторнировать заявку');
    }
  };

  const approve = (n: string) => setExpStatuses(st => ({ ...st, [n]: 'Согласовано' }));
  const decline = (n: string) => setExpStatuses(st => ({ ...st, [n]: 'Отклонено' }));

  /** Архив проекта — PATCH /api/projects/:id. */
  const toggleArchive = (id: string) => {
    const cur = apiProjects.find(p => String(p.id) === id);
    if (!cur) return;
    api.archiveProject(cur.id, !cur.archived)
      .then(() => loadData())
      .catch((e: unknown) => setLoadError(e instanceof ApiError ? e.message : 'Не удалось изменить архив'));
  };

  const goSettings = () => { setScreen('settings'); setSetTab('profile'); };
  const goUsers = () => { setScreen('settings'); setSetTab('users'); };

  const sel = selExp != null ? expRow(expenses[selExp]) : null;
  const sp = selProj != null ? projects.find(p => p.id === selProj) ?? null : null;

  /* ── Мобильная раскладка (ТЗ, п. 6: адаптив от 360px) ───────────────────
   *  Сайдбар уезжает в выдвижное меню, открывается бургером в шапке.        */
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (fn: () => void) => () => { fn(); setMenuOpen(false); };
  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', top: 0, bottom: 0, left: 0, width: 260, zIndex: 80,
        background: 'var(--fin-sidebar)', display: 'flex', flexDirection: 'column', overflowY: 'auto',
        transform: menuOpen ? 'none' : 'translateX(-100%)', transition: 'transform .2s ease',
        // Свёрнутое меню не должно ловить нажатия и попадать в скринридер
        visibility: menuOpen ? 'visible' : 'hidden',
        boxShadow: menuOpen ? '4px 0 28px rgba(0,0,0,.3)' : 'none',
      }
    : { width: 238, flex: 'none', background: 'var(--fin-sidebar)', display: 'flex', flexDirection: 'column', overflowY: 'auto' };

  return (
    <div data-app-shell style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontSize: 14 }}>
      {device === 'desktop' ? (
        <>
          {isMobile && menuOpen && (
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,23,.42)', zIndex: 79 }} />
          )}
          <div data-print-hide style={sidebarStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 16px 2px' }}>
              <Logo />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.03em', color: 'var(--fin-surface)' }}>IT-HONA</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', lineHeight: 1.35, marginTop: 2 }}>Интегрируем технологии.<br />Создаём надёжную инфраструктуру.</div>
              </div>
            </div>
            <SectionLabel pt={16}>ПАНЕЛЬ УПРАВЛЕНИЯ</SectionLabel>
            <NavItem label="Заявки на утверждение" icon={I.approve} badge={pendingReqs.length} active={screen === 'approvals'} onClick={go(() => setScreen('approvals'))} />
            <NavItem label="План-Факт" icon={I.pf} active={screen === 'report'} onClick={go(() => setScreen('report'))} />
            <NavItem label="Показатели" icon={I.pok} active={screen === 'panel'} onClick={go(() => setScreen('panel'))} />
            <NavItem label="Операции" icon={I.ops} active={screen === 'incomes' || screen === 'expenses'} onClick={go(() => setScreen('incomes'))} />
            <NavItem label="Задачи" icon={I.tasks} active={screen === 'tasks'} onClick={go(() => setScreen('tasks'))} />
            <NavItem label="Планирование" icon={I.plan} active={screen === 'planning'} onClick={go(() => setScreen('planning'))} />
            <SectionLabel>МОДУЛИ</SectionLabel>
            <NavItem label="Проекты" icon={I.prj} active={screen === 'projects'} onClick={go(() => setScreen('projects'))} />
            <NavItem label="Закупки" icon={I.deals} active={screen === 'deals'} onClick={go(() => setScreen('deals'))} />
            <NavItem label="Склад" icon={I.store} active={screen === 'stock'} onClick={go(() => setScreen('stock'))} />
            <NavItem label="Клиенты" icon={I.clients} active={screen === 'clients'} onClick={go(() => setScreen('clients'))} />
            <SectionLabel>НАСТРОЙКИ</SectionLabel>
            <NavItem label="Справочники" icon={I.sprav} active={screen === 'sprav'} onClick={go(() => setScreen('sprav'))} />
            <NavItem label="Пользователи" icon={I.users} active={screen === 'settings' && setTab === 'users'} onClick={go(goUsers)} />
            <NavItem label="Настройки" icon={I.set} active={screen === 'settings' && setTab !== 'users'} onClick={go(goSettings)} />
            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.16)', color: 'var(--fin-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flex: 'none' }}>{user ? initials(user.name) || 'РР' : 'РР'}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fin-surface)' }}>{user?.name ?? 'Руслан Рахмонов'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{user ? ROLE_LABELS[user.role] : 'Руководитель'}</div>
              </div>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5"><path d="M4 9l3-3 3 3" /></svg>
            </div>
          </div>
          <div data-app-main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div data-print-hide style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, padding: isMobile ? '0 12px' : '0 24px', background: 'var(--fin-surface)', borderBottom: '1px solid var(--fin-border)' }}>
              {isMobile && (
                <div
                  onClick={() => setMenuOpen(true)}
                  title="Меню"
                  className="hv-soft"
                  style={{ width: TAP, height: TAP, marginLeft: -6, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)', flex: 'none' }}
                >
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TITLES[screen]}</div>
                {isMobile && <div style={{ fontSize: 11, color: 'var(--fin-text-4)' }}>{range.label} · TJS</div>}
              </div>
              {!isMobile && <div style={{ fontSize: 12, color: 'var(--fin-text-4)' }}>{range.label} · суммы в сомони (TJS)</div>}
              <div style={{ flex: 1 }} />
              {!isMobile && (
                <>
                  <div style={{ display: 'inline-flex', background: 'var(--fin-bg)', padding: 3, borderRadius: 9, gap: 2 }}>
                    <div style={{ padding: '4px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 600, background: 'var(--fin-surface)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>Компьютер</div>
                    <div onClick={() => setDevice('mobile')} style={{ padding: '4px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 500, color: 'var(--fin-text-3)' }}>Телефон</div>
                  </div>
                  <div className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACC }} />IT-HONA LLC <span style={{ color: 'var(--fin-text-5)' }}>▾</span>
                  </div>
                </>
              )}
              <NotifyBell refreshTick={notifyTick} />
              {onLogout && (
                <div onClick={onLogout} title="Выйти из системы" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: isMobile ? 0 : '7px 13px', width: isMobile ? TAP : undefined, height: isMobile ? TAP : undefined, fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer', flex: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6" /><path d="M10.5 11.5L14 8l-3.5-3.5" /><path d="M14 8H6" /></svg>
                  {!isMobile && 'Выйти'}
                </div>
              )}
            </div>
            <div data-app-scroll style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px 28px' : '22px 28px 32px' }}>
              {screen === 'approvals' && <ApprovalsScreen onChanged={() => { void loadData(); setNotifyTick(t => t + 1); }} onError={setLoadError} />}
              {screen === 'panel' && <PanelScreen incomes={incomesRaw} expenses={expenses} totals={totals} pendingReqs={pendingReqs} decideRequest={decideRequest} period={period} setPeriod={setPeriod} projects={apiProjects} goReport={() => setScreen('report')} goExpenses={() => setScreen('expenses')} />}
              {screen === 'incomes' && <OperationsScreen dicts={dicts} projects={apiProjects} openCreate={setOpDrawer} refreshTick={opsTick} onChanged={() => { void loadData(); setNotifyTick(t => t + 1); }} onError={setLoadError} />}
              {screen === 'expenses' && <ExpensesScreen expenses={expenses} totals={totals} pendingCount={pendingReqs.length} goIncomes={() => setScreen('incomes')} openExpense={setSelExp} openCreate={() => setOpDrawer('out')} />}
              {screen === 'report' && <ReportScreen incomes={incomesRaw} expenses={expenses} totals={totals} periodLabel={range.label} from={range.from} to={range.to} dicts={dicts} projects={apiProjects} onError={setLoadError} />}
              {screen === 'projects' && <ProjectsScreen projects={projects} toggleArchive={toggleArchive} openProject={setSelProj} onSaved={loadData} onError={setLoadError} />}
              {screen === 'sprav' && <SpravScreen dicts={dicts} onChanged={reloadDicts} />}
              {screen === 'settings' && <SettingsScreen setTab={setTab} setSetTab={setSetTab} user={user} onChangePassword={onChangePassword} />}
              {screen === 'deals' && <DealsScreen dicts={dicts} projects={apiProjects} onError={setLoadError} onChanged={() => setNotifyTick(t => t + 1)} />}
              {screen === 'tasks' && <TasksScreen projects={apiProjects} users={assignees} role={user?.role ?? 'director'} onError={setLoadError} />}
              {screen === 'planning' && <PlanningScreen onError={setLoadError} onChanged={() => { void loadData(); setNotifyTick(t => t + 1); }} />}
              {screen === 'stock' && <StockScreen projects={apiProjects} onError={setLoadError} />}
              {screen === 'clients' && <ClientsScreen onError={setLoadError} />}
            </div>
          </div>
        </>
      ) : (
        <MobileView goDesktop={() => setDevice('desktop')} totals={totals} incomes={incomesRaw} expenses={expenses} />
      )}
      {loadError && (
        <div data-print-hide style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--fin-minus)', color: 'var(--fin-surface)', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 28px rgba(0,0,0,.24)', cursor: 'pointer' }}
          onClick={() => setLoadError(null)} title="Скрыть">
          {loadError}
        </div>
      )}
      {opDrawer && (
        <IncomeDrawer
          kind={opDrawer}
          dicts={dicts}
          projects={apiProjects}
          onClose={() => setOpDrawer(null)}
          onCreated={() => { setOpDrawer(null); setOpsTick(t => t + 1); void loadData(); }}
        />
      )}
      {sel && (
        <ExpenseDrawer
          sel={sel}
          onClose={() => setSelExp(null)}
          approve={approve}
          decline={decline}
          onStorno={stornoRequest}
          onError={setLoadError}
        />
      )}
      {sp && (
        <ProjectDrawer
          proj={sp}
          onClose={() => setSelProj(null)}
          onArchive={() => { toggleArchive(sp.id); setSelProj(null); }}
          onSaved={() => { setSelProj(null); void loadData(); }}
          onError={setLoadError}
        />
      )}
    </div>
  );
}
