import { useEffect, useState } from 'react';
import { ACC, applyThemeVars } from '../theme';
import { Logo } from '../components/ui';
import { PAY, TRIPS, CARS, type PayReq, type TripReq, type CarReq, type ReqKind } from '../data/cabinet';
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

const I = {
  pay: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8" /><path d="M1.5 6.5h13" /></svg>,
  car: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="9" height="6.5" rx="1" /><path d="M10 6.5h2.5L15 9v1.5h-5" /><circle cx="4" cy="11.5" r="1.2" /><circle cx="12" cy="11.5" r="1.2" /></svg>,
  hist: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5h12M2 8h12M2 12.5h8" /></svg>,
  prj: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="12" height="8.5" rx="1.8" /><path d="M6 5V3.8A1.3 1.3 0 017.3 2.5h1.4A1.3 1.3 0 0110 3.8V5" /><path d="M2 8.7h12" /></svg>,
};

const SectionLabel = ({ children, pt = 14 }: { children: string; pt?: number }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', color: 'rgba(255,255,255,.4)', padding: `${pt}px 22px 6px` }}>{children}</div>
);

export interface CabinetAppProps {
  onSwitchRole?: () => void;
}

export default function CabinetApp({ onSwitchRole }: CabinetAppProps) {
  const [screen, setScreen] = useState<CabScreen>('pay');
  const [pays, setPays] = useState<PayReq[]>(PAY);
  const [trips, setTrips] = useState<TripReq[]>(TRIPS);
  const [cars, setCars] = useState<CarReq[]>(CARS);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => { applyThemeVars(); }, []);
  useEffect(() => {
    if (toastMsg == null) return;
    const t = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const toast = (msg: string) => setToastMsg(msg);
  const addPay = (r: PayReq) => setPays(p => [r, ...p]);
  const addTrip = (r: TripReq) => setTrips(p => [r, ...p]);
  const addCar = (r: CarReq) => setCars(p => [r, ...p]);
  const deleteReq = (kind: ReqKind, id: string) => {
    if (kind === 'payment') setPays(p => p.filter(r => r.id !== id));
    if (kind === 'trip') setTrips(p => p.filter(r => r.id !== id));
    if (kind === 'auto') setCars(p => p.filter(r => r.id !== id));
  };

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
        <NavItem label="Проекты" icon={I.prj} active={screen === 'projects'} onClick={() => setScreen('projects')} />
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flex: 'none' }}>МС</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Мунира Саидова</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>Операционный бухгалтер</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5"><path d="M4 9l3-3 3 3" /></svg>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', background: '#FFFFFF', borderBottom: '1px solid #E7E5E0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>{TITLES[screen]}</div>
          <div style={{ fontSize: 12, color: '#8A918D' }}>Октябрь 2026 · суммы в сомони (TJS)</div>
          <div style={{ flex: 1 }} />
          <div className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACC }} />IT-HONA LLC <span style={{ color: '#A6ACA8' }}>▾</span>
          </div>
          <div className="hv-soft" style={{ position: 'relative', width: 38, height: 38, borderRadius: 9, border: '1px solid #E7E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5A625E' }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6.5a4 4 0 018 0c0 3 1.2 4 1.2 4H2.8S4 9.5 4 6.5z" /><path d="M6.5 13a1.5 1.5 0 003 0" /></svg>
            <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 99, background: '#D24A3D', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>1</span>
          </div>
          {onSwitchRole && (
            <div onClick={onSwitchRole} className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: '#5A625E', cursor: 'pointer' }}>
              ← Панель руководителя
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 32px' }}>
          {screen === 'pay' && <PayRequestsScreen pays={pays} trips={trips} cars={cars} addPay={addPay} toast={toast} />}
          {screen === 'car' && <CarRequestsScreen trips={trips} cars={cars} addTrip={addTrip} addCar={addCar} toast={toast} />}
          {screen === 'history' && <HistoryScreen pays={pays} trips={trips} cars={cars} deleteReq={deleteReq} />}
          {screen === 'projects' && <CabinetProjectsScreen pays={pays} trips={trips} cars={cars} />}
        </div>
      </div>
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
