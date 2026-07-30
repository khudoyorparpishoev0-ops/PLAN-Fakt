import { useEffect, useMemo, useState } from 'react';
import { ACC, applyThemeVars } from '../theme';
import { EXPENSES, PROJECTS, type Expense, type Project } from '../data/admin';
import { computeTotals, initials } from '../lib/compute';
import { ROLE_LABELS, type AuthUser } from '../lib/api';
import { expRow } from '../lib/rows';
import { Logo } from '../components/ui';
import PanelScreen from './PanelScreen';
import OperationsScreen from './OperationsScreen';
import ExpensesScreen from './ExpensesScreen';
import ReportScreen from './ReportScreen';
import ProjectsScreen from './ProjectsScreen';
import SpravScreen from './SpravScreen';
import SettingsScreen from './SettingsScreen';
import DealsScreen from './DealsScreen';
import MobileView from './MobileView';
import IncomeDrawer from './IncomeDrawer';
import ExpenseDrawer from './ExpenseDrawer';
import ProjectDrawer from './ProjectDrawer';

export type Screen = 'panel' | 'incomes' | 'expenses' | 'report' | 'sprav' | 'settings' | 'projects' | 'deals';

const TITLES: Record<Screen, string> = {
  panel: 'Финансовая панель', incomes: 'Операции', expenses: 'Операции · Расходы',
  report: 'Отчёт «План–Факт»', sprav: 'Справочники', settings: 'Настройки',
  projects: 'Проекты', deals: 'Сделки по закупкам',
};

/** Пункт бокового меню. */
function NavItem({ label, icon, active, disabled, onClick }: {
  label: string; icon: JSX.Element; active?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      title={disabled ? 'Появится на этапе 2' : undefined}
      className={!disabled && !active ? 'hv-side' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, height: 38, margin: '1px 10px', padding: '0 12px',
        borderRadius: 9, cursor: disabled ? 'default' : 'pointer',
        background: active ? ACC : 'transparent',
        color: disabled ? 'rgba(255,255,255,.4)' : active ? '#FFFFFF' : 'rgba(255,255,255,.82)',
      }}
    >
      {icon}
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
    </div>
  );
}

const SectionLabel = ({ children, pt = 14 }: { children: string; pt?: number }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', color: 'rgba(255,255,255,.4)', padding: `${pt}px 22px 6px` }}>{children}</div>
);

const I = {
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
}

export default function AdminApp({ user, onLogout }: AdminAppProps) {
  const [screen, setScreen] = useState<Screen>('panel');
  const [setTab, setSetTab] = useState('profile');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [expStatuses, setExpStatuses] = useState<Record<string, string>>({});
  const [selExp, setSelExp] = useState<number | null>(null);
  const [incDrawer, setIncDrawer] = useState(false);
  const [selProj, setSelProj] = useState<string | null>(null);
  const [archOv, setArchOv] = useState<Record<string, boolean>>({});

  useEffect(() => { applyThemeVars(); }, []);

  const expenses: Expense[] = useMemo(
    () => EXPENSES.map(e => ({ ...e, status: expStatuses[e.n] ?? e.status })),
    [expStatuses],
  );
  const totals = useMemo(() => computeTotals(expenses), [expenses]);
  const projects: (Project & { archived: boolean })[] = useMemo(
    () => PROJECTS.map(p => ({ ...p, archived: archOv[p.id] ?? !!p.archived })),
    [archOv],
  );

  const approve = (n: string) => setExpStatuses(st => ({ ...st, [n]: 'Согласовано' }));
  const decline = (n: string) => setExpStatuses(st => ({ ...st, [n]: 'Отклонено' }));
  const toggleArchive = (id: string) => {
    const cur = projects.find(p => p.id === id);
    if (cur) setArchOv(st => ({ ...st, [id]: !cur.archived }));
  };

  const goSettings = () => { setScreen('settings'); setSetTab('profile'); };
  const goUsers = () => { setScreen('settings'); setSetTab('users'); };

  const sel = selExp != null ? expRow(expenses[selExp]) : null;
  const sp = selProj != null ? projects.find(p => p.id === selProj) ?? null : null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontSize: 14 }}>
      {device === 'desktop' ? (
        <>
          <div style={{ width: 238, flex: 'none', background: '#123A26', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 16px 2px' }}>
              <Logo />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.03em', color: '#fff' }}>IT-HONA</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', lineHeight: 1.35, marginTop: 2 }}>Интегрируем технологии.<br />Создаём надёжную инфраструктуру.</div>
              </div>
            </div>
            <SectionLabel pt={16}>ПАНЕЛЬ УПРАВЛЕНИЯ</SectionLabel>
            <NavItem label="План-Факт" icon={I.pf} active={screen === 'report'} onClick={() => setScreen('report')} />
            <NavItem label="Показатели" icon={I.pok} active={screen === 'panel'} onClick={() => setScreen('panel')} />
            <NavItem label="Операции" icon={I.ops} active={screen === 'incomes' || screen === 'expenses'} onClick={() => setScreen('incomes')} />
            <NavItem label="Задачи" icon={I.tasks} disabled />
            <NavItem label="Планирование" icon={I.plan} disabled />
            <SectionLabel>МОДУЛИ</SectionLabel>
            <NavItem label="Проекты" icon={I.prj} active={screen === 'projects'} onClick={() => setScreen('projects')} />
            <NavItem label="Закупки" icon={I.deals} active={screen === 'deals'} onClick={() => setScreen('deals')} />
            <NavItem label="Склад" icon={I.store} disabled />
            <NavItem label="Клиенты" icon={I.clients} disabled />
            <SectionLabel>НАСТРОЙКИ</SectionLabel>
            <NavItem label="Справочники" icon={I.sprav} active={screen === 'sprav'} onClick={() => setScreen('sprav')} />
            <NavItem label="Пользователи" icon={I.users} active={screen === 'settings' && setTab === 'users'} onClick={goUsers} />
            <NavItem label="Настройки" icon={I.set} active={screen === 'settings' && setTab !== 'users'} onClick={goSettings} />
            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flex: 'none' }}>{user ? initials(user.name) || 'РР' : 'РР'}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name ?? 'Руслан Рахмонов'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{user ? ROLE_LABELS[user.role] : 'Руководитель'}</div>
              </div>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5"><path d="M4 9l3-3 3 3" /></svg>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', background: '#FFFFFF', borderBottom: '1px solid #E7E5E0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>{TITLES[screen]}</div>
              <div style={{ fontSize: 12, color: '#8A918D' }}>Октябрь 2026 · суммы в сомони (TJS)</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'inline-flex', background: '#EEF1EE', padding: 3, borderRadius: 9, gap: 2 }}>
                <div style={{ padding: '4px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 600, background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>Компьютер</div>
                <div onClick={() => setDevice('mobile')} style={{ padding: '4px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 500, color: '#6B7370' }}>Телефон</div>
              </div>
              <div className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACC }} />IT-HONA LLC <span style={{ color: '#A6ACA8' }}>▾</span>
              </div>
              <div className="hv-soft" style={{ position: 'relative', width: 38, height: 38, borderRadius: 9, border: '1px solid #E7E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5A625E' }}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6.5a4 4 0 018 0c0 3 1.2 4 1.2 4H2.8S4 9.5 4 6.5z" /><path d="M6.5 13a1.5 1.5 0 003 0" /></svg>
                <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 99, background: '#D24A3D', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>3</span>
              </div>
              {onLogout && (
                <div onClick={onLogout} title="Выйти из системы" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: '#5A625E', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6" /><path d="M10.5 11.5L14 8l-3.5-3.5" /><path d="M14 8H6" /></svg>
                  Выйти
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 32px' }}>
              {screen === 'panel' && <PanelScreen expenses={expenses} totals={totals} approve={approve} decline={decline} goReport={() => setScreen('report')} goExpenses={() => setScreen('expenses')} />}
              {screen === 'incomes' && <OperationsScreen openIncome={() => setIncDrawer(true)} />}
              {screen === 'expenses' && <ExpensesScreen expenses={expenses} totals={totals} goIncomes={() => setScreen('incomes')} openExpense={setSelExp} />}
              {screen === 'report' && <ReportScreen expenses={expenses} totals={totals} />}
              {screen === 'projects' && <ProjectsScreen projects={projects} toggleArchive={toggleArchive} openProject={setSelProj} />}
              {screen === 'sprav' && <SpravScreen />}
              {screen === 'settings' && <SettingsScreen setTab={setTab} setSetTab={setSetTab} />}
              {screen === 'deals' && <DealsScreen />}
            </div>
          </div>
        </>
      ) : (
        <MobileView goDesktop={() => setDevice('desktop')} totals={totals} expenses={expenses} />
      )}
      {incDrawer && <IncomeDrawer onClose={() => setIncDrawer(false)} />}
      {sel && (
        <ExpenseDrawer
          sel={sel}
          onClose={() => setSelExp(null)}
          approve={approve}
          decline={decline}
        />
      )}
      {sp && (
        <ProjectDrawer
          proj={sp}
          onClose={() => setSelProj(null)}
          onArchive={() => { toggleArchive(sp.id); setSelProj(null); }}
        />
      )}
    </div>
  );
}
