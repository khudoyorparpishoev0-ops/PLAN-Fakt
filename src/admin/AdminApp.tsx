import { useEffect, useMemo, useState } from 'react';
import { ACC, applyThemeVars, num } from '../theme';
import { PF_DEFAULTS, type PfThresholds } from '../lib/badges';
import { Ic, type IconName } from '../icons';
import { savedDensity } from './CompanyTab';
import type { Expense, Income, Project } from '../data/admin';
import { computeTotals, initials } from '../lib/compute';
import {
  api, ApiError, ROLE_LABELS,
  type ApiAssignee, type ApiDictionaries, type ApiMetrics, type ApiProject, type ApiRequest, type AuthUser,
} from '../lib/api';
import { toExpense, toIncome } from '../lib/mapping';
import { DEFAULT_PERIOD, periodRange, type PeriodKind } from '../lib/period';
import type { CurrencyRow } from '../lib/currency';
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
import { ErrorState } from '../components/states';
import NotificationsScreen, { type NotifyTarget } from './NotificationsScreen';
import ExpenseDrawer from './ExpenseDrawer';
import ProjectDrawer from './ProjectDrawer';

export type Screen =
  | 'panel' | 'incomes' | 'expenses' | 'report' | 'sprav' | 'settings' | 'projects' | 'deals'
  | 'tasks' | 'planning' | 'stock' | 'clients' | 'approvals' | 'notifications';

const TITLES: Record<Screen, string> = {
  panel: 'Финансовая панель', incomes: 'Операции', expenses: 'Операции · Расходы',
  report: 'Отчёт «План–Факт»', sprav: 'Справочники', settings: 'Настройки',
  projects: 'Проекты', deals: 'Сделки по закупкам',
  tasks: 'Задачи', planning: 'Планирование', stock: 'Склад', clients: 'Клиенты и поставщики',
  approvals: 'Заявки на утверждение', notifications: 'Уведомления',
};

/** Пункт бокового меню. */
function NavItem({ label, icon, active, disabled, badge, onClick }: {
  label: string; icon: IconName; active?: boolean; disabled?: boolean;
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
      {/* Правило набора: штрих активного пункта — 2, обычного — 1.7 */}
      <Ic name={icon} bold={active} />
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

/** Иконки меню — по карте «иконка → пункт» из it-hona/icons.js (src/icons.tsx). */
const I: Record<string, IconName> = {
  bell: 'bell', approve: 'approve', pf: 'chart', pok: 'gauge', ops: 'list',
  tasks: 'check', plan: 'calendar', prj: 'folder', deals: 'cart', store: 'box',
  clients: 'briefcase', sprav: 'book', users: 'users', set: 'sliders',
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

  /** Пороги статусов План-Факта — настраиваемые (решение заказчика 02.08),
   *  поэтому грузятся с сервера и раздаются экранам, а не зашиты в код. */
  const [pf, setPf] = useState<PfThresholds>(PF_DEFAULTS);
  useEffect(() => { api.settings().then(s => setPf(s.pf)).catch(() => {}); }, []);

  /** Справочник валют с курсами: нужен формам ввода операций и экрану курсов.
   *  Читается один раз — список ISO не меняется, курсы обновляет reloadCurrencies. */
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const reloadCurrencies = () => { void api.currencies().then(setCurrencies).catch(() => {}); };
  useEffect(reloadCurrencies, []);

  useEffect(() => { applyThemeVars(undefined, savedDensity()); }, []);

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
  const totals = useMemo(() => computeTotals(incomesRaw, expenses, metrics, pf), [incomesRaw, expenses, metrics, pf]);
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
            <NavItem label="Уведомления" icon={I.bell} active={screen === 'notifications'} onClick={go(() => setScreen('notifications'))} />
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
              <NotifyBell refreshTick={notifyTick} onOpenAll={() => setScreen('notifications')} />
              {onLogout && (
                <div onClick={onLogout} title="Выйти из системы" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: isMobile ? 0 : '7px 13px', width: isMobile ? TAP : undefined, height: isMobile ? TAP : undefined, fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer', flex: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6" /><path d="M10.5 11.5L14 8l-3.5-3.5" /><path d="M14 8H6" /></svg>
                  {!isMobile && 'Выйти'}
                </div>
              )}
            </div>
            <div data-app-scroll style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px 28px' : '22px 28px 32px' }}>
              {screen === 'notifications' && (
                <NotificationsScreen
                  role={user?.role ?? 'director'}
                  onChanged={() => setNotifyTick(t => t + 1)}
                  onError={setLoadError}
                  onOpen={(t: NotifyTarget) => setScreen(
                    t.screen === 'history' ? 'approvals' : (t.screen as Screen),
                  )}
                />
              )}
              {screen === 'approvals' && <ApprovalsScreen role={user?.role ?? 'director'} onChanged={() => { void loadData(); setNotifyTick(t => t + 1); }} onError={setLoadError} />}
              {screen === 'panel' && <PanelScreen role={user?.role ?? 'director'} incomes={incomesRaw} expenses={expenses} totals={totals} pf={pf} pendingReqs={pendingReqs} decideRequest={decideRequest} period={period} setPeriod={setPeriod} projects={apiProjects} goReport={() => setScreen('report')} goExpenses={() => setScreen('expenses')} />}
              {screen === 'incomes' && <OperationsScreen dicts={dicts} projects={apiProjects} openCreate={setOpDrawer} refreshTick={opsTick} onChanged={() => { void loadData(); setNotifyTick(t => t + 1); }} onError={setLoadError} />}
              {screen === 'expenses' && <ExpensesScreen expenses={expenses} totals={totals} pendingCount={pendingReqs.length} goIncomes={() => setScreen('incomes')} openExpense={setSelExp} openCreate={() => setOpDrawer('out')} />}
              {screen === 'report' && <ReportScreen incomes={incomesRaw} expenses={expenses} totals={totals} pf={pf} periodLabel={range.label} from={range.from} to={range.to} dicts={dicts} projects={apiProjects} onError={setLoadError} />}
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
      {/* Ошибка не закрывает экран: остальные цифры человеку ещё нужны.
          Техника — под «Подробности», с копированием для поддержки. */}
      {loadError && (
        <div data-print-hide style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, width: 460, maxWidth: 'calc(100vw - 24px)', boxShadow: 'var(--fin-shadow-pop)', borderRadius: 12 }}>
          <ErrorState
            title="Данные не загрузились"
            reassure="Введённое сохранено — не отобразилась только часть цифр."
            detail={loadError}
            onRetry={() => { setLoadError(null); void loadData(); }}
            compact
          />
          <div
            onClick={() => setLoadError(null)} title="Скрыть"
            style={{ position: 'absolute', top: 8, right: 10, cursor: 'pointer', color: 'var(--fin-minus)', fontSize: 15, fontWeight: 700, lineHeight: 1 }}
          >×</div>
        </div>
      )}
      {opDrawer && (
        <IncomeDrawer
          currencies={currencies}
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
