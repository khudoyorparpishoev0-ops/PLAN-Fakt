import { num } from '../theme';
import { fmt } from '../lib/format';
import { badge, type BadgeData } from '../lib/badges';
import { Badge, Th } from '../components/ui';
import { KM_RATE, type CarReq, type PayReq, type ReqStatus, type TripReq } from '../data/cabinet';
import { PROJECTS, type Project } from '../data/admin';

export interface CabinetProjectsScreenProps {
  pays: PayReq[];
  trips: TripReq[];
  cars: CarReq[];
}

/** Бейдж статуса проекта (та же цветовая логика, что в прототипе админ-панели). */
function statusBadge(status: Project['status'] | null): BadgeData {
  if (status === 'plan') return badge('Плановый', 'blue');
  if (status === 'work') return badge('В работе', 'yellow');
  if (status === 'done') return badge('Завершён', 'green');
  return badge('—', 'gray');
}

/** Виртуальная строка «Без проекта», добавляется к списку проектов после фильтрации архива. */
const NO_PROJECT: Pick<Project, 'name' | 'group' | 'resp'> & { status: null } = {
  name: 'Без проекта', group: '—', resp: '—', status: null,
};

export default function CabinetProjectsScreen({ pays, trips, cars }: CabinetProjectsScreenProps) {
  /* ── Все мои заявки одним списком: проект / статус / сумма (поездки — по km*KM_RATE) ── */
  const all: { project: string; status: ReqStatus; amount: number }[] = [
    ...pays.map((p) => ({ project: p.project, status: p.status, amount: p.amount })),
    ...trips.map((t) => ({ project: t.project, status: t.status, amount: t.km * KM_RATE })),
    ...cars.map((c) => ({ project: c.project, status: c.status, amount: c.amount })),
  ];

  const agg = (projectName: string) => {
    const rows = all.filter((r) => r.project === projectName);
    const approved = rows.filter((r) => r.status === 'Одобрено').reduce((s, r) => s + r.amount, 0);
    const pending = rows
      .filter((r) => r.status === 'Отправлено' || r.status === 'На рассмотрении')
      .reduce((s, r) => s + r.amount, 0);
    return { count: rows.length, approved, pending };
  };

  const rows = [
    ...PROJECTS.filter((p) => !p.archived).map((p) => ({
      name: p.name, group: p.group, resp: p.resp, status: p.status as Project['status'] | null,
      ...agg(p.name),
    })),
    { name: NO_PROJECT.name, group: NO_PROJECT.group, resp: NO_PROJECT.resp, status: NO_PROJECT.status, ...agg(NO_PROJECT.name) },
  ];

  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalApproved = rows.reduce((s, r) => s + r.approved, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);

  return (
    <div data-screen-label="Проекты">
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th style={{ paddingLeft: 16 }}>Проект</Th>
              <Th>Ответственный</Th>
              <Th right>Мои заявки</Th>
              <Th right>Одобрено</Th>
              <Th right>Ждёт решения</Th>
              <Th style={{ paddingRight: 16 }}>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="hv-row">
                <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>{r.group}</div>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{r.resp}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right', ...num }}>
                  {r.count === 0 ? <span style={{ color: '#A6ACA8' }}>—</span> : r.count}
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right', ...num, fontWeight: 600 }}>
                  {r.approved === 0 ? (
                    <span style={{ color: '#A6ACA8', fontWeight: 400 }}>—</span>
                  ) : (
                    <span style={{ color: '#1A7A4B' }}>
                      {fmt(r.approved)}
                      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}> TJS</span>
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right', ...num, fontWeight: 600 }}>
                  {r.pending === 0 ? (
                    <span style={{ color: '#A6ACA8', fontWeight: 400 }}>—</span>
                  ) : (
                    <span style={{ color: '#8A6A00' }}>
                      {fmt(r.pending)}
                      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}> TJS</span>
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED' }}>
                  <Badge b={statusBadge(r.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '10px 16px', borderTop: '1px solid #E7E5E0', background: '#FAF9F6', fontSize: 12.5, alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>{rows.length} проектов</span>
          <span style={{ color: '#6B7370' }}>Мои заявки: <b style={num}>{totalCount}</b></span>
          <span style={{ color: '#6B7370' }}>Одобрено: <b style={{ color: '#1A7A4B', ...num }}>{fmt(totalApproved)} TJS</b></span>
          <span style={{ color: '#6B7370' }}>Ждёт решения: <b style={{ color: '#8A6A00', ...num }}>{fmt(totalPending)} TJS</b></span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#8A918D', marginTop: 10, lineHeight: 1.5 }}>
        Показаны только ваши заявки и суммы по ним. Полные финансовые показатели проектов доступны администратору и директору.
      </div>
    </div>
  );
}
