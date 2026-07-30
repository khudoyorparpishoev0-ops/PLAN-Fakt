import { num } from '../theme';
import { fmt } from '../lib/format';
import { PROJECTS } from '../data/admin';
import { KM_RATE, cabProjB, type CarReq, type PayReq, type ReqStatus, type TripReq } from '../data/cabinet';
import { CabBadge, TD_CAB, TH_CAB } from './PayRequestsScreen';

export interface CabinetProjectsScreenProps {
  pays: PayReq[];
  trips: TripReq[];
  cars: CarReq[];
}

export default function CabinetProjectsScreen({ pays, trips, cars }: CabinetProjectsScreenProps) {
  /* Все мои заявки, нормализованные к { project, status, amount } (поездки — компенсация км). */
  const all: { project: string; status: ReqStatus; amount: number }[] = [
    ...pays.map((r) => ({ project: r.project, status: r.status, amount: r.amount })),
    ...trips.map((r) => ({ project: r.project, status: r.status, amount: r.km * KM_RATE })),
    ...cars.map((r) => ({ project: r.project, status: r.status, amount: r.amount })),
  ];

  const rows = PROJECTS.filter((p) => !p.archived).map((p) => {
    const mine = all.filter((r) => r.project === p.name);
    const ok = mine.filter((r) => r.status === 'Одобрено').reduce((s, r) => s + r.amount, 0);
    const wait = mine.filter((r) => r.status === 'Отправлено' || r.status === 'На рассмотрении').reduce((s, r) => s + r.amount, 0);
    return { name: p.name, group: p.group, resp: p.resp, cnt: mine.length, ok, wait, b: cabProjB(p.status) };
  });

  return (
    <div data-screen-label="Проекты" style={{ animation: 'cabFade .2s ease' }}>
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #F0EFEA' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>МОИ ПРОЕКТЫ</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#66706C', background: '#EFEEEA', borderRadius: 99, padding: '2px 9px', fontFamily: "'IBM Plex Sans',sans-serif" }}>{rows.length}</span>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: '#8A918D' }}>Бухгалтер видит только суммы своих заявок по проекту</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...TH_CAB, padding: '11px 20px' }}>Проект</th>
            <th style={TH_CAB}>Ответственный</th>
            <th style={{ ...TH_CAB, textAlign: 'right' }}>Мои заявки</th>
            <th style={{ ...TH_CAB, textAlign: 'right' }}>Одобрено</th>
            <th style={{ ...TH_CAB, textAlign: 'right' }}>Ждёт решения</th>
            <th style={{ ...TH_CAB, padding: '11px 20px 11px 14px' }}>Статус</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="hv-row" style={{ cursor: 'pointer' }}>
                <td style={{ ...TD_CAB, padding: '13px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>{r.group}</div>
                </td>
                <td style={{ ...TD_CAB, fontSize: 12.5, color: '#5A625E' }}>{r.resp}</td>
                <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', ...num }}>{r.cnt}</td>
                <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#1A7A4B', ...num, whiteSpace: 'nowrap' }}>{fmt(r.ok)} TJS</td>
                <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#9A6B00', ...num, whiteSpace: 'nowrap' }}>{fmt(r.wait)} TJS</td>
                <td style={{ ...TD_CAB, padding: '13px 20px 13px 14px' }}><CabBadge b={r.b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
