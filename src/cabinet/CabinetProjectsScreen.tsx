import { num } from '../theme';
import { fmt } from '../lib/format';
import { PROJECTS } from '../data/admin';
import { cabProjB, type CarReq, type PayReq, type ReqStatus, type TripReq } from '../data/cabinet';
import { tripAmount } from '../data/settings';
import { CabBadge, TD_CAB, TH_CAB } from './PayRequestsScreen';

export interface CabinetProjectsScreenProps {
  pays: PayReq[];
  trips: TripReq[];
  cars: CarReq[];
}

export default function CabinetProjectsScreen({ pays, trips, cars }: CabinetProjectsScreenProps) {
  /* Все мои заявки, нормализованные к { project, status, amount, km }.
   * Поездки в деньгах учитываются только при заданной ставке (settings.kmRate);
   * пока ставка не задана — их километры показываются второй строкой. */
  const all: { project: string; status: ReqStatus; amount: number; km: number }[] = [
    ...pays.map((r) => ({ project: r.project, status: r.status, amount: r.amount, km: 0 })),
    ...trips.map((r) => ({ project: r.project, status: r.status, amount: tripAmount(r.km), km: r.km })),
    ...cars.map((r) => ({ project: r.project, status: r.status, amount: r.amount, km: 0 })),
  ];

  const rows = PROJECTS.filter((p) => !p.archived).map((p) => {
    const mine = all.filter((r) => r.project === p.name);
    const bucket = (pred: (r: (typeof all)[number]) => boolean) => {
      const rs = mine.filter(pred);
      return {
        sum: rs.reduce((s, r) => s + r.amount, 0),
        km: rs.reduce((s, r) => s + (r.amount === 0 ? r.km : 0), 0),
      };
    };
    const ok = bucket((r) => r.status === 'Одобрено');
    const wait = bucket((r) => r.status === 'Отправлено' || r.status === 'На рассмотрении');
    return { name: p.name, group: p.group, resp: p.resp, cnt: mine.length, ok, wait, b: cabProjB(p.status) };
  });

  /** Денежная сумма + непересчитанные километры второй строкой. */
  const SumCell = ({ v }: { v: { sum: number; km: number } }) => (
    <>
      <div>{fmt(v.sum)} TJS</div>
      {v.km > 0 && <div style={{ fontSize: 11, fontWeight: 500, color: '#A6ACA8' }}>+ {fmt(v.km)} км</div>}
    </>
  );

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
                <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#1A7A4B', ...num, whiteSpace: 'nowrap' }}><SumCell v={r.ok} /></td>
                <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#9A6B00', ...num, whiteSpace: 'nowrap' }}><SumCell v={r.wait} /></td>
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
