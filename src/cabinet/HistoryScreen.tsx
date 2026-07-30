import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import {
  CABINET_PROJECTS, MONTHLY, dirB,
  type CarReq, type PayReq, type ReqKind, type ReqStatus, type TripReq,
} from '../data/cabinet';
import { kmRateSet, tripAmount } from '../data/settings';
import { CabBadge, TD_CAB, TH_CAB } from './PayRequestsScreen';

export interface HistoryScreenProps {
  pays: PayReq[];
  trips: TripReq[];
  cars: CarReq[];
  deleteReq: (kind: ReqKind, id: string) => void;
}

const SUM_LAB: CSSProperties = { fontSize: 10.5, color: '#A6ACA8', fontWeight: 600 };
const SECTION_LAB: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8' };

/* ── Иконки действий (прототип, строки 364–367) ── */
const CamIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="4" width="13" height="9.5" rx="1.8" /><circle cx="8" cy="8.7" r="2.4" /><path d="M5.5 4l1-1.6h3L10.5 4" /></svg>;
const DocIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1.5h5.5L13 5v9.5H4z" /><path d="M9 1.5V5h4" /><path d="M6 8.5h4M6 11h3" /></svg>;
const EyeIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" /><circle cx="8" cy="8" r="1.8" /></svg>;
const TrashIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6.5 4V2.8h3V4M4.5 4l.6 9h5.8l.6-9" /></svg>;
const CloseIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>;
const FileChipIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /></svg>;
const ImageChipIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" /><path d="M1.5 9l3-3 3 3 2-2 3 3" /></svg>;

/** Кнопка действия в реестре — 32×32 с рамкой (прототип, строки 364–367). */
function ActionBtn({ children, title, danger, onClick }: {
  children: ReactNode; title?: string; danger?: boolean; onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div onClick={onClick} title={title} className={danger ? 'hv-red' : 'hv-soft'} style={{
      width: 32, height: 32, borderRadius: 8,
      border: danger ? '1px solid #F0CFC9' : '1px solid #E7E5E0',
      background: danger ? '#FCEBE8' : '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      color: danger ? '#D24A3D' : '#6B7370', flex: 'none',
    }}>{children}</div>
  );
}

/** Вкладка реестра с нижней полосой-индикатором (прототип, строки 339–341). */
function HistTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      padding: '0 2px 12px', fontSize: 13, cursor: 'pointer',
      fontWeight: active ? 700 : 500, color: active ? ACC : '#8A918D',
      boxShadow: active ? 'inset 0 -3px 0 var(--fin-accent,#1B7A3C)' : 'none',
    }}>{label}</div>
  );
}

/** Компактный пончик 60×60 в шапке реестра (прототип, строки 320–330).
 *  Цвета категорий — из прототипа: Оплаты #22935B, Поездки #E5A400, Авто #D24A3D.
 *  ringValue — денежная доля в кольце; legendText — подпись в легенде
 *  (для поездок без заданной ставки компенсации — километры, а не сумма). */
function MiniDonut({ items }: { items: { label: string; ringValue: number; legendText: string; color: string }[] }) {
  const total = items.reduce((s, it) => s + it.ringValue, 0);
  let acc = 0;
  const segs = items.map((it) => {
    const pct = total > 0 ? (it.ringValue / total) * 100 : 0;
    const seg = { color: it.color, dash: pct, offset: 25 - acc };
    acc += pct;
    return seg;
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #EDEBE6', borderRadius: 12, padding: '10px 14px', background: '#FBFBF9' }}>
      <svg width="60" height="60" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#EFEEE9" strokeWidth="7" />
        {total > 0 && segs.filter((s) => s.dash > 0).map((s, i) => (
          <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={s.color} strokeWidth="7"
            pathLength={100} strokeDasharray={`${s.dash} ${100 - s.dash}`} strokeDashoffset={s.offset} />
        ))}
      </svg>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5A625E', marginBottom: 6 }}>Расходы по категориям</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((it) => (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7370' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />{it.label} · {it.legendText}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Компактный спарклайн «Статистика по месяцам» 150×46 (прототип, строки 331–334). */
function MiniSparkline({ data }: { data: { m: string; sum: number }[] }) {
  const W = 150, H = 46, PAD = 4;
  const maxV = Math.max(...data.map((d) => d.sum)) * 1.1;
  const n = data.length;
  const pts = data.map((d, i) => `${3 + (i * (W - 6)) / (n - 1)},${H - PAD - (d.sum / maxV) * (H - 2 * PAD - 4)}`);
  const last = pts[n - 1].split(',').map(Number);
  return (
    <div style={{ border: '1px solid #EDEBE6', borderRadius: 12, padding: '10px 14px', background: '#FBFBF9' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5A625E', marginBottom: 8 }}>Статистика по месяцам</div>
      <svg width="150" height="46" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <polyline fill="none" stroke="#EFEEE9" strokeWidth="1" points={`2,${H - 4} ${W - 2},${H - 4}`} />
        <polyline fill="none" stroke="var(--fin-accent,#1B7A3C)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
        <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--fin-accent,#1B7A3C)" />
      </svg>
    </div>
  );
}

/** Карточка фильтра с select 40px (прототип, строки 305–312). */
function FilterCard({ label, value, options, onChange }: {
  label: string; value: string; options: { v: string; t: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '13px 15px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D', marginBottom: 9 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', height: 40, border: '1px solid #DFDCD6', borderRadius: 9, padding: '0 30px 0 12px', fontSize: 13, background: '#fff', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
          {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 12, top: 13, pointerEvents: 'none', color: '#A6ACA8' }}>▾</span>
      </div>
    </div>
  );
}

/** Строка «метка — значение» в блоке ДЕТАЛИ шторки. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #EFEDE8', padding: '5px 0' }}>
      <span style={{ color: '#8A918D' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

type StepState = 'done' | 'current' | 'future' | 'rejected';

/** Вертикальный таймлайн статусов заявки в шторке (карточка заявки — ТЗ, п. 4.3). */
function StatusTimeline({ status }: { status: ReqStatus }) {
  const currentIndex = status === 'Черновик' ? 0 : status === 'Отправлено' ? 1 : status === 'На рассмотрении' ? 2 : 3;
  const allDone = status === 'Одобрено';
  const rejected = status === 'Отклонено';

  const steps: { label: string; sub: string }[] = [
    { label: 'Черновик — заявка создана', sub: 'Заявка сохранена и доступна для редактирования' },
    { label: 'Отправлено Директору', sub: 'Направлена на согласование' },
    { label: 'На рассмотрении', sub: 'Директор изучает заявку' },
    rejected
      ? { label: 'Отклонено', sub: 'Заявка возвращена без исполнения' }
      : { label: 'Одобрено · плановая операция', sub: 'Учтено в плановых показателях проекта' },
  ];

  const stateAt = (i: number): StepState => {
    if (rejected && i === 3) return 'rejected';
    if (i < currentIndex) return 'done';
    if (i === currentIndex) return allDone ? 'done' : 'current';
    return 'future';
  };

  return (
    <div>
      {steps.map((st, i) => {
        const state = stateAt(i);
        const isLast = i === steps.length - 1;
        const nextState = !isLast ? stateAt(i + 1) : null;
        const circleBg = state === 'done' ? ACC : state === 'rejected' ? '#D24A3D' : '#fff';
        const circleColor = state === 'done' || state === 'rejected' ? '#fff' : state === 'current' ? ACC : '#A6ACA8';
        const circleBorder = state === 'current' ? `2px solid ${ACC}` : state === 'future' ? '2px solid #E5E3DD' : 'none';
        const content = state === 'done' ? '✓' : state === 'rejected' ? '✕' : String(i + 1);
        const lineColor = nextState === 'done' ? ACC : '#E9E7E1';
        return (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: circleBg, color: circleColor, border: circleBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>
                {content}
              </div>
              {!isLast && <div style={{ width: 2, flex: 1, minHeight: 16, background: lineColor, margin: '3px 0' }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{st.label}</div>
              <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>{st.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Нормализованный вид заявки (любого вида) для шторки. */
interface DrawerView {
  kind: ReqKind; id: string; project: string; status: ReqStatus; title: string; date: string;
  metricLabel: string; metricValue: string; currencyValue: string;
  nameLabel: string; nameValue: string; contragent?: string; attachLabel: string; attachValue: string;
}

function findRow(pays: PayReq[], trips: TripReq[], cars: CarReq[], sel: { kind: ReqKind; id: string }): PayReq | TripReq | CarReq | undefined {
  if (sel.kind === 'payment') return pays.find((p) => p.id === sel.id);
  if (sel.kind === 'trip') return trips.find((p) => p.id === sel.id);
  return cars.find((p) => p.id === sel.id);
}

function buildDrawerView(kind: ReqKind, row: PayReq | TripReq | CarReq): DrawerView {
  if (kind === 'payment') {
    const r = row as PayReq;
    return {
      kind, id: r.id, project: r.project, status: r.status, title: r.name, date: r.date,
      metricLabel: 'СУММА', metricValue: fmt(r.amount), currencyValue: r.currency,
      nameLabel: 'Наименование', nameValue: r.name, attachLabel: 'Документ', attachValue: r.doc || '—',
    };
  }
  if (kind === 'trip') {
    const r = row as TripReq;
    return {
      kind, id: r.id, project: r.project, status: r.status, title: r.goal, date: r.date,
      metricLabel: 'КМ', metricValue: `${fmt(r.km)} км`, currencyValue: 'TJS',
      nameLabel: 'Цель', nameValue: r.goal, contragent: r.contragent, attachLabel: 'Фото', attachValue: r.photo || '—',
    };
  }
  const r = row as CarReq;
  return {
    kind, id: r.id, project: r.project, status: r.status, title: r.category, date: r.date,
    metricLabel: 'СУММА', metricValue: fmt(r.amount), currencyValue: r.currency,
    nameLabel: 'Категория', nameValue: r.category, attachLabel: 'Чек', attachValue: r.receipt || '—',
  };
}

/** Унифицированная строка реестра (прототип: одни колонки для всех вкладок). */
interface HistRow {
  kind: ReqKind; id: string; date: string; project: string; name: string; amount: string;
  status: ReqStatus; cam?: string; doc?: string;
}

export default function HistoryScreen(props: HistoryScreenProps) {
  const { pays, trips, cars, deleteReq } = props;

  const [fProject, setFProject] = useState('Все');
  const [kind, setKind] = useState<ReqKind>('payment');
  const [fPeriod, setFPeriod] = useState('За месяц');
  const [fStatus, setFStatus] = useState('Все');
  const [selReq, setSelReq] = useState<{ kind: ReqKind; id: string } | null>(null);

  /* ── Фильтрация по проекту/статусу — применяется и к графикам, и к реестру ── */
  const passes = (project: string, status: ReqStatus) =>
    (fProject === 'Все' || project === fProject) && (fStatus === 'Все' || status === fStatus);

  const filteredPays = pays.filter((r) => passes(r.project, r.status));
  const filteredTrips = trips.filter((r) => passes(r.project, r.status));
  const filteredCars = cars.filter((r) => passes(r.project, r.status));

  /* ── Донат: категории поверх всех трёх видов; цвета — из прототипа.
   *    Поездки: при заданной ставке — денежная доля в кольце и % в легенде,
   *    иначе — километры в легенде и без сегмента (в кольце только деньги). ── */
  const sumPays = filteredPays.reduce((s, r) => s + r.amount, 0);
  const sumCars = filteredCars.reduce((s, r) => s + r.amount, 0);
  const tripsKm = filteredTrips.reduce((s, r) => s + r.km, 0);
  const tripsMoney = filteredTrips.reduce((s, r) => s + tripAmount(r.km), 0);
  const ringTotal = sumPays + sumCars + tripsMoney;
  const pctOf = (v: number) => (ringTotal > 0 ? Math.round((v / ringTotal) * 100) : 0) + '%';
  const donutItems = [
    { label: 'Оплаты', ringValue: sumPays, legendText: pctOf(sumPays), color: '#22935B' },
    kmRateSet()
      ? { label: 'Поездки', ringValue: tripsMoney, legendText: pctOf(tripsMoney), color: '#E5A400' }
      : { label: 'Поездки', ringValue: 0, legendText: `${fmt(tripsKm)} км`, color: '#E5A400' },
    { label: 'Авто', ringValue: sumCars, legendText: pctOf(sumCars), color: '#D24A3D' },
  ];

  const rows: HistRow[] =
    kind === 'payment'
      ? filteredPays.map((r) => ({ kind: 'payment' as ReqKind, id: r.id, date: r.date, project: r.project, name: r.name, amount: `${fmt(r.amount)} ${r.currency}`, status: r.status, doc: r.doc }))
      : kind === 'trip'
        ? filteredTrips.map((r) => ({ kind: 'trip' as ReqKind, id: r.id, date: r.date, project: r.project, name: r.goal, amount: `${fmt(r.km)} км`, status: r.status, cam: r.photo }))
        : filteredCars.map((r) => ({ kind: 'auto' as ReqKind, id: r.id, date: r.date, project: r.project, name: r.category, amount: `${fmt(r.amount)} ${r.currency}`, status: r.status, doc: r.receipt }));

  const selRow = selReq ? findRow(pays, trips, cars, selReq) : undefined;
  const dv = selReq && selRow ? buildDrawerView(selReq.kind, selRow) : null;

  return (
    <div data-screen-label="Список всего / История" style={{ animation: 'cabFade .2s ease' }}>
      {/* ── 4 карточки-фильтра (прототип, строки 304–313) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        <FilterCard label="ФИЛЬТР ПО ПРОЕКТУ" value={fProject} onChange={setFProject}
          options={[{ v: 'Все', t: 'Все проекты' }, ...CABINET_PROJECTS.map((p) => ({ v: p, t: p }))]} />
        <FilterCard label="ТИП (Оплата/Авто)" value={kind} onChange={(v) => setKind(v as ReqKind)}
          options={[{ v: 'payment', t: 'Заявки на оплату' }, { v: 'trip', t: 'Заявки на машину' }, { v: 'auto', t: 'Расходы на авто' }]} />
        <FilterCard label="ПЕРИОД (Дата)" value={fPeriod} onChange={setFPeriod}
          options={['За месяц', 'За квартал', 'За год', 'Всё время'].map((p) => ({ v: p, t: p }))} />
        <FilterCard label="СТАТУС" value={fStatus} onChange={setFStatus}
          options={[{ v: 'Все', t: 'Все статусы' }, { v: 'Одобрено', t: 'Одобрено' }, { v: 'На рассмотрении', t: 'На рассмотрении' }, { v: 'Отклонено', t: 'Отклонено' }, { v: 'Отправлено', t: 'Отправлено' }, { v: 'Черновик', t: 'Черновик' }]} />
      </div>

      {/* ── Главный реестр (прототип, строки 315–374) ── */}
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 20px 14px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 700, paddingTop: 6 }}>ГЛАВНЫЙ РЕЕСТР ЗАЯВОК</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <MiniDonut items={donutItems} />
            <MiniSparkline data={MONTHLY} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 26, padding: '0 20px', borderBottom: '1px solid #E7E5E0' }}>
          <HistTab active={kind === 'payment'} label="Все Заявки на Оплату" onClick={() => setKind('payment')} />
          <HistTab active={kind === 'trip'} label="Все Заявки на Поездки" onClick={() => setKind('trip')} />
          <HistTab active={kind === 'auto'} label="Все Расходы на Авто" onClick={() => setKind('auto')} />
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...TH_CAB, padding: '11px 20px' }}>ID</th>
            <th style={TH_CAB}>Дата</th>
            <th style={TH_CAB}>Проект</th>
            <th style={TH_CAB}>Наименование</th>
            <th style={{ ...TH_CAB, textAlign: 'right' }}>Сумма</th>
            <th style={TH_CAB}>Директор (Статус)</th>
            <th style={{ ...TH_CAB, padding: '11px 20px 11px 14px', textAlign: 'right' }}>Действия</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hv-row">
                <td style={{ ...TD_CAB, padding: '13px 20px', fontSize: 12.5, fontWeight: 600, color: ACC, fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap', cursor: 'pointer' }}
                  onClick={() => setSelReq({ kind: r.kind, id: r.id })}>{r.id}</td>
                <td style={{ ...TD_CAB, fontSize: 12.5, color: '#3E4643', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>{r.date}</td>
                <td style={{ ...TD_CAB, fontSize: 12.5, color: '#5A625E' }}>{r.project}</td>
                <td style={{ ...TD_CAB, fontSize: 13, fontWeight: 500 }}>{r.name}</td>
                <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{r.amount}</td>
                <td style={TD_CAB}><CabBadge b={dirB(r.status)} /></td>
                <td style={{ ...TD_CAB, padding: '11px 20px 11px 14px' }}>
                  <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                    {r.cam && <ActionBtn title={`Фото Км · ${r.cam}`}><CamIcon /></ActionBtn>}
                    {r.doc && <ActionBtn title={`Документ / чек · ${r.doc}`}><DocIcon /></ActionBtn>}
                    <ActionBtn title="Просмотр" onClick={() => setSelReq({ kind: r.kind, id: r.id })}><EyeIcon /></ActionBtn>
                    {r.status === 'Черновик' && (
                      <ActionBtn danger title="Удалить" onClick={(e) => { e.stopPropagation(); deleteReq(r.kind, r.id); }}><TrashIcon /></ActionBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── Шторка заявки — карточка с историей статусов (ТЗ, п. 4.3) ── */}
      {dv && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={() => setSelReq(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, maxWidth: '94vw', background: '#fff', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 22px', borderBottom: '1px solid #EFEEE9' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{dv.title}</div>
                <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>Заявка {dv.id} · {dv.project}</div>
              </div>
              <div style={{ flex: 1 }} />
              <span style={{ marginTop: 2 }}><CabBadge b={dirB(dv.status)} /></span>
              <span onClick={() => setSelReq(null)} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}>
                <CloseIcon />
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: '#FAF9F6', border: '1px solid #EFEDE8', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
                <div><div style={SUM_LAB}>ДАТА</div><div style={{ ...num, fontSize: 15, fontWeight: 600 }}>{dv.date}</div></div>
                <div><div style={SUM_LAB}>{dv.metricLabel}</div><div style={{ ...num, fontSize: 15, fontWeight: 600 }}>{dv.metricValue}</div></div>
                <div><div style={SUM_LAB}>ВАЛЮТА</div><div style={{ ...num, fontSize: 15, fontWeight: 600 }}>{dv.currencyValue}</div></div>
              </div>

              <div style={{ ...SECTION_LAB, marginBottom: 12 }}>ИСТОРИЯ СТАТУСОВ</div>
              <StatusTimeline status={dv.status} />

              <div style={{ ...SECTION_LAB, margin: '6px 0 10px' }}>ДЕТАЛИ</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 16 }}>
                <DetailRow label="Проект" value={dv.project} />
                <DetailRow label={dv.nameLabel} value={dv.nameValue} />
                {dv.kind === 'trip' && <DetailRow label="Контрагент" value={dv.contragent || '—'} />}
                <DetailRow label={dv.attachLabel} value={dv.attachValue} />
                <DetailRow label="Автор" value="Фаридун" />
                <DetailRow label="Директор" value="Р. Рахмонов" />
              </div>

              {dv.attachValue !== '—' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div className="hv-row" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #E7E5E0', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                    {dv.kind === 'trip' ? <ImageChipIcon /> : <FileChipIcon />}
                    {dv.attachValue}
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #EFEEE9', padding: '14px 22px', display: 'flex', justifyContent: 'flex-end' }}>
              <div onClick={() => setSelReq(null)} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>
                Закрыть
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
