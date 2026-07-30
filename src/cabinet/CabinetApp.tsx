import { useEffect, useState } from 'react';
import { ACC, applyThemeVars, num } from '../theme';
import { fmt } from '../lib/format';
import { initials } from '../lib/compute';
import {
  api, ApiError, ROLE_LABELS,
  type ApiProject, type ApiRequest, type AuthUser, type CreateRequestPayload,
} from '../lib/api';
import { monthlyStats, toCar, toPay, toTrip } from '../lib/mapping';
import { Logo } from '../components/ui';
import { CB, type ReqKind, type ReqStatus } from '../data/cabinet';
import { setKmRate, tripAmount } from '../data/settings';
import PayRequestsScreen from './PayRequestsScreen';
import CarRequestsScreen from './CarRequestsScreen';
import HistoryScreen from './HistoryScreen';
import CabinetProjectsScreen from './CabinetProjectsScreen';

export type CabScreen = 'pay' | 'car' | 'history' | 'projects';

const TITLES: Record<CabScreen, string> = {
  pay: 'Заявки на оплату', car: 'Заявки на машину', history: 'Список всего / История', projects: 'Проекты',
};

function NavItem({ label, icon, active, onClick }: { label: string; icon: JSX.Element; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={!active ? 'hv-side' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, height: 38, margin: '1px 10px', padding: '0 12px',
        borderRadius: 9, cursor: 'pointer',
        background: active ? ACC : 'transparent',
        color: active ? '#FFFFFF' : 'rgba(255,255,255,.82)',
      }}
    >
      {icon}
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
    </div>
  );
}

/* Иконки бокового меню — 1:1 из прототипа кабинета (строки 32–42). */
const I = {
  pay: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="3.5" width="13" height="9" rx="2" /><path d="M1.5 6.5h13" /><path d="M4 10h3" /></svg>,
  car: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10l1-3.4A2 2 0 015 5.2h6a2 2 0 011.9 1.4L14 10" /><rect x="1.5" y="9.7" width="13" height="3.3" rx="1.2" /><circle cx="4.5" cy="13.4" r=".8" fill="currentColor" stroke="none" /><circle cx="11.5" cy="13.4" r=".8" fill="currentColor" stroke="none" /></svg>,
  hist: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 14V2" /><path d="M2 13h12" /><rect x="4" y="8.5" width="2.4" height="4" rx=".5" fill="currentColor" stroke="none" /><rect x="7.6" y="5.5" width="2.4" height="7" rx=".5" fill="currentColor" stroke="none" /><rect x="11.2" y="3" width="2.4" height="9.5" rx=".5" fill="currentColor" stroke="none" /></svg>,
  proj: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="12" height="8.5" rx="1.8" /><path d="M6 5V3.8A1.3 1.3 0 017.3 2.5h1.4A1.3 1.3 0 0110 3.8V5" /><path d="M2 8.7h12" /></svg>,
};

const SectionLabel = ({ children, pt = 14 }: { children: string; pt?: number }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', color: 'rgba(255,255,255,.4)', padding: `${pt}px 22px 6px` }}>{children}</div>
);

/** Склонение «заявка / заявки / заявок». */
function pluralReq(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 'заявка' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'заявки' : 'заявок';
}

/** KPI-карточка кабинета — паттерн прототипа (строки 82–91). */
function KpiCard({ label, value, unit, note, icon, iconBg, iconFg, b }: {
  label: string; value: string; unit: string; note: string;
  icon: string; iconBg: string; iconFg: string; b: { t: string; fg: string; bg: string; dot: string };
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '15px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, color: iconFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 14, fontWeight: 700 }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: '#8A918D' }}>{label}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: b.fg, background: b.bg }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.dot }} />{b.t}
        </span>
      </div>
      <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.02em', ...num }}>
        {value} <span style={{ fontSize: 11.5, fontWeight: 500, color: '#8A918D', fontFamily: "'Golos Text',sans-serif" }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 6 }}>{note}</div>
    </div>
  );
}

const CHIP: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E0DED8', background: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: '#5A625E', cursor: 'pointer' };

const PWD_LAB: React.CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };
const PWD_INP: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 11px', fontSize: 13, outline: 'none', background: '#fff' };

/** Модалка «Сменить пароль». Если передан submit (API из ШАГА 2) — меняет
 *  пароль по-настоящему и показывает ошибки сервера. */
function ChangePasswordModal({ onClose, onDone, submit }: {
  onClose: () => void;
  onDone: () => void;
  submit?: (current: string, next: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = current.length > 0 && next.length >= 8 && repeat === next && !busy;

  const doSubmit = async () => {
    if (!valid) return;
    if (!submit) { onDone(); return; }
    setBusy(true);
    setError(null);
    try {
      await submit(current, next);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить пароль.');
      setBusy(false);
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '94vw', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px', animation: 'finFade .18s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Сменить пароль</div>
          <div onClick={onClose} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A918D' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#8A918D', lineHeight: 1.5, marginBottom: 16 }}>
          Пароль из первоначальной настройки — временный: смените его при первом входе.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={PWD_LAB}>Текущий пароль</div>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" style={PWD_INP} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={PWD_LAB}>Новый пароль</div>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Минимум 8 символов" style={PWD_INP} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={PWD_LAB}>Повторите пароль</div>
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="Ещё раз новый пароль" style={PWD_INP} />
          {repeat.length > 0 && repeat !== next && (
            <div style={{ fontSize: 11.5, color: '#B93227', marginTop: 4 }}>Пароли не совпадают</div>
          )}
          {error && <div style={{ fontSize: 11.5, color: '#B93227', marginTop: 4 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отменить</div>
          <div
            onClick={valid ? doSubmit : undefined}
            className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}
          >
            {busy ? 'Сохраняем…' : 'Сменить пароль'}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface CabinetAppProps {
  user?: AuthUser;
  onLogout?: () => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
}

export default function CabinetApp({ user, onLogout, onChangePassword }: CabinetAppProps) {
  const [screen, setScreen] = useState<CabScreen>('pay');
  const [period, setPeriod] = useState('Месяц');
  const [reqs, setReqs] = useState<ApiRequest[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pwdModal, setPwdModal] = useState(false);

  useEffect(() => { applyThemeVars(); }, []);
  useEffect(() => {
    if (toastMsg == null) return;
    const t = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const toast = (msg: string) => setToastMsg(msg);

  /* ── Данные с API: мои заявки, проекты, настройки (ставка км) ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [requests, projectList, settings] = await Promise.all([
          api.requests(), api.projects(), api.settings(),
        ]);
        if (!alive) return;
        setKmRate(settings.kmRate);
        setProjects(projectList);
        setReqs(requests);
      } catch (e) {
        if (alive) toast(e instanceof ApiError ? e.message : 'Не удалось загрузить данные');
      }
    })();
    return () => { alive = false; };
  }, []);

  const pays = reqs.filter(r => r.kind === 'payment').map(toPay);
  const trips = reqs.filter(r => r.kind === 'trip').map(toTrip);
  const cars = reqs.filter(r => r.kind === 'auto').map(toCar);
  const monthly = monthlyStats(reqs);
  // Проекты для селектов форм — активные («В работе», не в архиве)
  const formProjects = projects.filter(p => p.status === 'work' && !p.archived);

  /** Создание заявки: POST /api/requests, новая строка — в начало списка. */
  const createRequest = async (payload: CreateRequestPayload): Promise<boolean> => {
    try {
      const r = await api.createRequest(payload);
      setReqs(list => [r, ...list]);
      toast(`Заявка ${r.number} отправлена Директору`);
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось отправить заявку');
      return false;
    }
  };

  /** Удаление черновика (ТЗ: только «Черновик»). */
  const deleteReq = async (_kind: ReqKind, number: string) => {
    const r = reqs.find(x => x.number === number);
    if (!r) return;
    try {
      await api.deleteRequest(r.id);
      setReqs(list => list.filter(x => x.id !== r.id));
      toast(`Черновик ${number} удалён`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось удалить заявку');
    }
  };

  /* ── KPI поверх всех трёх видов заявок (значения считаются из данных).
   *    Поездки в деньгах учитываются только при заданной ставке (settings.kmRate);
   *    иначе одобренные километры показываются отдельно, в подписи карточки. ── */
  const all: { status: ReqStatus; amount: number; km: number }[] = [
    ...pays.map(p => ({ status: p.status, amount: p.amount, km: 0 })),
    ...trips.map(t => ({ status: t.status, amount: tripAmount(t.km), km: t.km })),
    ...cars.map(c => ({ status: c.status, amount: c.amount, km: 0 })),
  ];
  const count = (st: ReqStatus) => all.filter(r => r.status === st).length;
  const nSent = count('Отправлено'), nPend = count('На рассмотрении'), nRej = count('Отклонено');
  const approvedRows = all.filter(r => r.status === 'Одобрено');
  const approvedSum = approvedRows.reduce((s, r) => s + r.amount, 0);
  const approvedKm = approvedRows.reduce((s, r) => s + (r.amount === 0 ? r.km : 0), 0);
  const approvedNote = `${approvedRows.length} ${pluralReq(approvedRows.length)} к оплате`
    + (approvedKm > 0 ? ` · ${fmt(approvedKm)} км` : '');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontSize: 14 }}>
      <div style={{ width: 238, flex: 'none', background: '#123A26', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 16px 2px' }}>
          <Logo />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.03em', color: '#fff' }}>IT-HONA</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', lineHeight: 1.35, marginTop: 2 }}>Интегрируем технологии.<br />Создаём надёжную инфраструктуру.</div>
          </div>
        </div>
        <SectionLabel pt={16}>ЗАЯВКИ</SectionLabel>
        <NavItem label="Заявки на оплату" icon={I.pay} active={screen === 'pay'} onClick={() => setScreen('pay')} />
        <NavItem label="Заявки на машину" icon={I.car} active={screen === 'car'} onClick={() => setScreen('car')} />
        <SectionLabel>ОТЧЁТЫ</SectionLabel>
        <NavItem label="Список всего / История" icon={I.hist} active={screen === 'history'} onClick={() => setScreen('history')} />
        <NavItem label="Проекты" icon={I.proj} active={screen === 'projects'} onClick={() => setScreen('projects')} />
        <div onClick={() => setPwdModal(true)} title="Сменить пароль" style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flex: 'none' }}>{user ? initials(user.name) || 'Ф' : 'Ф'}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name ?? 'Фаридун'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{user ? ROLE_LABELS[user.role] : 'Операционный бухгалтер'}</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5"><path d="M4 9l3-3 3 3" /></svg>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', background: '#fff', borderBottom: '1px solid #E7E5E0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>{TITLES[screen]}</div>
          <div style={{ fontSize: 12, color: '#8A918D' }}>Октябрь 2026 · суммы в сомони (TJS)</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', background: '#EEF1EE', padding: 3, borderRadius: 9, gap: 2 }}>
            <div style={{ padding: '4px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 600, background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>Компьютер</div>
            <div style={{ padding: '4px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 500, color: '#6B7370' }}>Телефон</div>
          </div>
          <div className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACC }} />IT-HONA LLC <span style={{ color: '#A6ACA8' }}>▾</span>
          </div>
          <div className="hv-soft" style={{ position: 'relative', width: 38, height: 38, borderRadius: 9, border: '1px solid #E7E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5A625E', flex: 'none' }}>
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
          {/* ── Общая панель периодов и фильтров (прототип, строки 68–80) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ display: 'inline-flex', background: '#EBEAE4', padding: 3, borderRadius: 9, gap: 2 }}>
              {['День', 'Неделя', 'Месяц', 'Квартал', 'Год'].map(t => {
                const a = period === t;
                return (
                  <div key={t} onClick={() => setPeriod(t)} style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: a ? 600 : 500, color: a ? '#1B1F1E' : '#6B7370', background: a ? '#FFFFFF' : 'transparent', boxShadow: a ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{t}</div>
                );
              })}
            </div>
            <div style={{ width: 1, height: 22, background: '#E0DED8' }} />
            <div className="hv-soft" style={CHIP}>Проект: <b style={{ color: '#1B1F1E', fontWeight: 600 }}>Все</b> <span style={{ color: '#A6ACA8' }}>▾</span></div>
            <div className="hv-soft" style={CHIP}>Статус: <b style={{ color: '#1B1F1E', fontWeight: 600 }}>Все</b> <span style={{ color: '#A6ACA8' }}>▾</span></div>
            <div className="hv-soft" style={CHIP}>Валюта: <b style={{ color: '#1B1F1E', fontWeight: 600 }}>TJS</b> <span style={{ color: '#A6ACA8' }}>▾</span></div>
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative' }}>
              <input placeholder="Поиск по заявкам" style={{ width: 230, height: 34, border: '1px solid #E0DED8', borderRadius: 8, background: '#fff', padding: '0 12px 0 34px', fontSize: 12.5, outline: 'none' }} />
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#A6ACA8" strokeWidth="1.6" style={{ position: 'absolute', left: 11, top: 9 }}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
            </div>
          </div>
          {/* ── Общий KPI-ряд (прототип, строки 81–92; значения считаются из данных) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
            <KpiCard label="ОТПРАВЛЕНО" value={String(nSent)} unit={pluralReq(nSent)} note="За месяц" icon="↗" iconBg="rgba(27,122,60,.1)" iconFg={ACC} b={CB.sent} />
            <KpiCard label="НА РАССМОТРЕНИИ" value={String(nPend)} unit={pluralReq(nPend)} note="Ждут решения Директора" icon="⏱" iconBg="#FCF1D6" iconFg="#9A6B00" b={CB.pending} />
            <KpiCard label="ОДОБРЕНО" value={fmt(approvedSum)} unit="TJS" note={approvedNote} icon="✓" iconBg="#E4F3E9" iconFg="#1A7A4B" b={CB.approved} />
            <KpiCard label="ОТКЛОНЕНО" value={String(nRej)} unit={pluralReq(nRej)} note="Требуют исправления" icon="!" iconBg="#FAE7E4" iconFg="#B93227" b={CB.rejected} />
          </div>
          {screen === 'pay' && <PayRequestsScreen pays={pays} projects={formProjects} createRequest={createRequest} toast={toast} />}
          {screen === 'car' && <CarRequestsScreen trips={trips} cars={cars} projects={formProjects} createRequest={createRequest} toast={toast} />}
          {screen === 'history' && <HistoryScreen pays={pays} trips={trips} cars={cars} monthly={monthly} projectNames={formProjects.map(p => p.name)} deleteReq={deleteReq} toast={toast} />}
          {screen === 'projects' && <CabinetProjectsScreen pays={pays} trips={trips} cars={cars} projects={projects} />}
        </div>
      </div>
      {pwdModal && (
        <ChangePasswordModal
          onClose={() => setPwdModal(false)}
          onDone={() => { setPwdModal(false); toast('Пароль обновлён'); }}
          submit={onChangePassword}
        />
      )}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: '#1B1F1E', color: '#fff', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 28px rgba(0,0,0,.24)', animation: 'finFade .18s ease', display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#22935B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2"><path d="M1.5 5.2L4 7.5l4.5-5" /></svg>
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
