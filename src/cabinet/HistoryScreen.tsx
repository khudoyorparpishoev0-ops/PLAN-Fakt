import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import { Badge, Th } from '../components/ui';
import {
  CABINET_PROJECTS, KM_RATE, MONTHLY, dirB,
  type CarReq, type PayReq, type ReqKind, type ReqStatus, type TripReq,
} from '../data/cabinet';

export interface HistoryScreenProps {
  pays: PayReq[];
  trips: TripReq[];
  cars: CarReq[];
  deleteReq: (kind: ReqKind, id: string) => void;
}

/* ── Общие стили полей фильтров (паттерн прототипа) ── */
const FILT_LAB: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', marginBottom: 6 };
const SEL: CSSProperties = { width: '100%', height: 32, border: '1px solid #E0DED8', borderRadius: 8, padding: '0 8px', fontSize: 13, fontWeight: 600, background: '#fff' };
const SUM_LAB: CSSProperties = { fontSize: 10.5, color: '#A6ACA8', fontWeight: 600 };
const SECTION_LAB: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8' };

const STATUS_OPTIONS: ReqStatus[] = ['Отправлено', 'На рассмотрении', 'Одобрено', 'Отклонено', 'Черновик'];

/** Сумма «12 345,00 TJS»: целая часть Plex + мелкий серый суффикс с копейками и валютой (паттерн PayRequestsScreen). */
function Money({ amount, currency = 'TJS' }: { amount: number; currency?: string }) {
  const cents = Math.round((amount - Math.trunc(amount)) * 100);
  return (
    <span style={{ ...num, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {fmt(Math.trunc(amount))}
      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}>,{String(cents).padStart(2, '0')} {currency}</span>
    </span>
  );
}

/* ── Иконки (14×14, stroke currentColor, паттерн прототипа) ── */
function EyeIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 7S3.4 3 7 3s6 4 6 4-2.4 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.6" /></svg>;
}
function CameraIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1.5 4.5h2.2L5 2.8h4L10.2 4.5h2.3v7.2H1.5z" /><circle cx="7" cy="8" r="2.2" /></svg>;
}
function DocIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /></svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.5 3.5l.7 8A1.5 1.5 0 005.7 13h2.6a1.5 1.5 0 001.5-1.4l.7-8.1" /></svg>;
}
function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>;
}
function FileChipIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /></svg>;
}
function ImageChipIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" /><path d="M1.5 9l3-3 3 3 2-2 3 3" /></svg>;
}

/** Иконка-кнопка действия в таблице реестра (26×26, hv-cream / hv-red при danger). */
function IconBtn({ children, title, danger, onClick }: {
  children: ReactNode; title?: string; danger?: boolean; onClick?: (e: MouseEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span onClick={onClick} title={title} className={danger ? 'hv-red' : 'hv-cream'}
      style={{ width: 26, height: 26, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: danger ? '#B93227' : '#8A918D', flex: 'none' }}>
      {children}
    </span>
  );
}

/** Карточка фильтра (метка + select). */
function FilterCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '12px 14px' }}>
      <div style={FILT_LAB}>{label}</div>
      {children}
    </div>
  );
}

/** Вкладка реестра (паттерн прототипа, строки 304–308). */
function KindTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      color: active ? '#1B1F1E' : '#6B7370', background: active ? '#F1F0EB' : 'transparent',
    }}>
      {label} <span style={{ color: '#A6ACA8' }}>{count}</span>
    </div>
  );
}

/* ── Донат-диаграмма «Расходы по категориям» ── */
interface DonutItem { label: string; value: number; color: string }

function DonutChart({ items }: { items: DonutItem[] }) {
  const R = 58, CX = 66, CY = 66, SW = 16;
  const CIRC = 2 * Math.PI * R;
  const GAP = 3;
  const total = items.reduce((s, it) => s + it.value, 0);

  let cumulative = 0;
  const segs = items.map((it) => {
    const frac = total > 0 ? it.value / total : 0;
    const len = frac * CIRC;
    const dash = Math.max(len - GAP, 0);
    const offset = -cumulative;
    cumulative += len;
    return { color: it.color, dash, offset };
  });

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 132, height: 132, flex: 'none' }}>
        <svg width={132} height={132} viewBox="0 0 132 132">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#EFEEEA" strokeWidth={SW} />
          {total > 0 && (
            <g transform={`rotate(-90 ${CX} ${CY})`}>
              {segs.map((s, i) => (
                <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.color} strokeWidth={SW}
                  strokeDasharray={`${s.dash} ${CIRC - s.dash}`} strokeDashoffset={s.offset} />
              ))}
            </g>
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...num, fontSize: 15, fontWeight: 700 }}>{fmt(total)}</div>
          <div style={{ fontSize: 10, color: '#8A918D' }}>TJS</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {items.map((it) => {
          const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
          return (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flex: 'none' }} />
              <span style={{ fontSize: 13 }}>{it.label}</span>
              <span style={{ flex: 1 }} />
              <span style={{ ...num, fontSize: 13, fontWeight: 600 }}>{fmt(it.value)}</span>
              <span style={{ fontSize: 12, color: '#8A918D', width: 42, textAlign: 'right' }}>{pct}%</span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: '#A6ACA8', marginTop: 2 }}>Поездки — компенсация {KM_RATE} смн/км</div>
      </div>
    </div>
  );
}

/* ── Линейный график «Статистика по месяцам» ── */
function MonthlyLineChart({ data, hoveredIdx, setHoveredIdx }: {
  data: { m: string; sum: number }[]; hoveredIdx: number | null; setHoveredIdx: (i: number | null) => void;
}) {
  const W = 460, H = 150, PAD_TOP = 20, PAD_BOTTOM = 20, X_PAD = 12;
  const n = data.length;
  const maxV = Math.max(...data.map((d) => d.sum)) * 1.15;
  const xAt = (i: number) => X_PAD + (i * (W - 2 * X_PAD)) / (n - 1);
  const yAt = (v: number) => H - PAD_BOTTOM - (v / maxV) * (H - PAD_TOP - PAD_BOTTOM);
  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.sum), v: d.sum, m: d.m }));
  const polylinePoints = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${pts[0].x},${H - PAD_BOTTOM} L${pts.map((p) => `${p.x},${p.y}`).join(' L')} L${pts[n - 1].x},${H - PAD_BOTTOM} Z`;
  const gridYs = [1, 2, 3].map((k) => PAD_TOP + (k * (H - PAD_TOP - PAD_BOTTOM)) / 4);
  const last = pts[n - 1];
  const colWidth = W / n;

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg width="100%" height="auto" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
          {gridYs.map((y, i) => <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="#F3F2ED" strokeWidth={1} />)}
          <path d={areaPath} fill="rgba(27,122,60,.07)" stroke="none" />
          <polyline points={polylinePoints} fill="none" stroke="#1B7A3C" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={hoveredIdx === i ? 5 : 3.5} fill="#1B7A3C" stroke="#fff" strokeWidth={2} />
          ))}
          <text x={last.x + 6} y={last.y - 8} fontSize={11} fontWeight={600} fill="#1B1F1E">{fmt(last.v)}</text>
          {pts.map((p, i) => (
            <rect key={i} x={i * colWidth} y={0} width={colWidth} height={H} fill="transparent" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} />
          ))}
        </svg>
        {hoveredIdx !== null && (
          <div style={{
            position: 'absolute', left: `${(pts[hoveredIdx].x / W) * 100}%`, top: `${(pts[hoveredIdx].y / H) * 100}%`,
            transform: 'translate(-50%,-130%)', background: '#1B1F1E', color: '#fff', borderRadius: 8, padding: '6px 10px',
            fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            <div style={num}>{fmt(pts[hoveredIdx].v)}</div>
            <div style={{ fontSize: 10.5, opacity: .7 }}>{pts[hoveredIdx].m}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex' }}>
        {pts.map((p, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: '#8A918D' }}>{p.m}</div>)}
      </div>
    </div>
  );
}

/** Строка «метка — значение» в блоке ДЕТАЛИ. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #EFEDE8', padding: '5px 0' }}>
      <span style={{ color: '#8A918D' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

type StepState = 'done' | 'current' | 'future' | 'rejected';

/** Вертикальный таймлайн статусов заявки в шторке (паттерн прототипа 1185–1196). */
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

export default function HistoryScreen(props: HistoryScreenProps) {
  const { pays, trips, cars, deleteReq } = props;

  const [fProject, setFProject] = useState('Все');
  const [kind, setKind] = useState<ReqKind>('payment');
  const [fPeriod, setFPeriod] = useState<'Месяц' | 'Квартал' | 'Год' | 'Всё время'>('Месяц');
  const [fStatus, setFStatus] = useState<'Все' | ReqStatus>('Все');
  const [selReq, setSelReq] = useState<{ kind: ReqKind; id: string } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  /* ── Фильтрация по проекту/статусу — применяется и к графикам, и к реестру ── */
  const passesProject = (project: string) => fProject === 'Все' || project === fProject;
  const passesStatus = (status: ReqStatus) => fStatus === 'Все' || status === fStatus;

  const filteredPays = pays.filter((r) => passesProject(r.project) && passesStatus(r.status));
  const filteredTrips = trips.filter((r) => passesProject(r.project) && passesStatus(r.status));
  const filteredCars = cars.filter((r) => passesProject(r.project) && passesStatus(r.status));

  /* ── Донат: расходы по категориям поверх всех трёх видов заявок ── */
  const sumPay = filteredPays.reduce((s, r) => s + r.amount, 0);
  const sumTripAmt = filteredTrips.reduce((s, r) => s + r.km * KM_RATE, 0);
  const sumCar = filteredCars.reduce((s, r) => s + r.amount, 0);
  const donutItems: DonutItem[] = [
    { label: 'Оплаты', value: sumPay, color: '#1B7A3C' },
    { label: 'Поездки', value: sumTripAmt, color: '#3D62B3' },
    { label: 'Авто', value: sumCar, color: '#C9A227' },
  ];

  /* ── Реестр: активный вид (синхронизирован с фильтром «Тип») ── */
  const activeList = kind === 'payment' ? filteredPays : kind === 'trip' ? filteredTrips : filteredCars;
  const activeSum = kind === 'payment' ? sumPay : kind === 'auto' ? sumCar : 0;
  const tripKmSum = filteredTrips.reduce((s, r) => s + r.km, 0);

  const selRow = selReq ? findRow(pays, trips, cars, selReq) : undefined;
  const dv = selReq && selRow ? buildDrawerView(selReq.kind, selRow) : null;

  return (
    <div data-screen-label="Список всего / История">
      {/* ── Фильтры ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        <FilterCard label="ПРОЕКТ">
          <select value={fProject} onChange={(e) => setFProject(e.target.value)} style={SEL}>
            <option value="Все">Все</option>
            {CABINET_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FilterCard>
        <FilterCard label="ТИП">
          <select value={kind} onChange={(e) => setKind(e.target.value as ReqKind)} style={SEL}>
            <option value="payment">Оплаты</option>
            <option value="trip">Поездки</option>
            <option value="auto">Авто</option>
          </select>
        </FilterCard>
        <FilterCard label="ПЕРИОД">
          <select value={fPeriod} onChange={(e) => setFPeriod(e.target.value as typeof fPeriod)} style={SEL}>
            <option value="Месяц">Месяц</option>
            <option value="Квартал">Квартал</option>
            <option value="Год">Год</option>
            <option value="Всё время">Всё время</option>
          </select>
        </FilterCard>
        <FilterCard label="СТАТУС">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} style={SEL}>
            <option value="Все">Все</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FilterCard>
      </div>

      {/* ── Графики ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Расходы по категориям</div>
          <DonutChart items={donutItems} />
        </div>
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Статистика по месяцам</div>
          <div style={{ fontSize: 11.5, color: '#8A918D', marginBottom: 8 }}>мои заявки · TJS</div>
          <MonthlyLineChart data={MONTHLY} hoveredIdx={hoveredIdx} setHoveredIdx={setHoveredIdx} />
        </div>
      </div>

      {/* ── Реестр заявок ── */}
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid #E7E5E0' }}>
          <KindTab active={kind === 'payment'} label="Оплаты" count={filteredPays.length} onClick={() => setKind('payment')} />
          <KindTab active={kind === 'trip'} label="Поездки" count={filteredTrips.length} onClick={() => setKind('trip')} />
          <KindTab active={kind === 'auto'} label="Авто" count={filteredCars.length} onClick={() => setKind('auto')} />
        </div>

        {kind === 'payment' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ paddingLeft: 16 }}>ID</Th>
              <Th>Дата</Th>
              <Th>Проект</Th>
              <Th>Наименование</Th>
              <Th right>Сумма</Th>
              <Th>Директор</Th>
              <Th right style={{ paddingRight: 16 }}>Действия</Th>
            </tr></thead>
            <tbody>
              {filteredPays.map((r) => (
                <tr key={r.id} className="hv-row">
                  <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED' }}>
                    <span onClick={() => setSelReq({ kind: 'payment', id: r.id })} style={{ ...num, color: ACC, fontWeight: 600, cursor: 'pointer' }}>{r.id}</span>
                  </td>
                  <td style={{ ...num, padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right' }}><Money amount={r.amount} currency={r.currency} /></td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED' }}><Badge b={dirB(r.status)} /></td>
                  <td style={{ padding: '10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <IconBtn title="Открыть" onClick={() => setSelReq({ kind: 'payment', id: r.id })}><EyeIcon /></IconBtn>
                      {r.doc && <IconBtn title={r.doc}><DocIcon /></IconBtn>}
                      {r.status === 'Черновик' && (
                        <IconBtn danger title="Удалить" onClick={(e) => { e.stopPropagation(); deleteReq('payment', r.id); }}><TrashIcon /></IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {kind === 'trip' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ paddingLeft: 16 }}>ID</Th>
              <Th>Дата</Th>
              <Th>Проект</Th>
              <Th>Цель</Th>
              <Th right>Км</Th>
              <Th>Директор</Th>
              <Th right style={{ paddingRight: 16 }}>Действия</Th>
            </tr></thead>
            <tbody>
              {filteredTrips.map((r) => (
                <tr key={r.id} className="hv-row">
                  <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED' }}>
                    <span onClick={() => setSelReq({ kind: 'trip', id: r.id })} style={{ ...num, color: ACC, fontWeight: 600, cursor: 'pointer' }}>{r.id}</span>
                  </td>
                  <td style={{ ...num, padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600 }}>{r.goal}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right' }}>
                    <span style={{ ...num, fontWeight: 600, fontSize: 13 }}>{fmt(r.km)}<span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}> км</span></span>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED' }}><Badge b={dirB(r.status)} /></td>
                  <td style={{ padding: '10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <IconBtn title="Открыть" onClick={() => setSelReq({ kind: 'trip', id: r.id })}><EyeIcon /></IconBtn>
                      <IconBtn title={r.photo}><CameraIcon /></IconBtn>
                      {r.status === 'Черновик' && (
                        <IconBtn danger title="Удалить" onClick={(e) => { e.stopPropagation(); deleteReq('trip', r.id); }}><TrashIcon /></IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {kind === 'auto' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ paddingLeft: 16 }}>ID</Th>
              <Th>Дата</Th>
              <Th>Проект</Th>
              <Th>Категория</Th>
              <Th right>Сумма</Th>
              <Th>Директор</Th>
              <Th right style={{ paddingRight: 16 }}>Действия</Th>
            </tr></thead>
            <tbody>
              {filteredCars.map((r) => (
                <tr key={r.id} className="hv-row">
                  <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED' }}>
                    <span onClick={() => setSelReq({ kind: 'auto', id: r.id })} style={{ ...num, color: ACC, fontWeight: 600, cursor: 'pointer' }}>{r.id}</span>
                  </td>
                  <td style={{ ...num, padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600 }}>{r.category}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right' }}><Money amount={r.amount} currency={r.currency} /></td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED' }}><Badge b={dirB(r.status)} /></td>
                  <td style={{ padding: '10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <IconBtn title="Открыть" onClick={() => setSelReq({ kind: 'auto', id: r.id })}><EyeIcon /></IconBtn>
                      {r.receipt && <IconBtn title={r.receipt}><DocIcon /></IconBtn>}
                      {r.status === 'Черновик' && (
                        <IconBtn danger title="Удалить" onClick={(e) => { e.stopPropagation(); deleteReq('auto', r.id); }}><TrashIcon /></IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #E7E5E0', background: '#FAF9F6', fontSize: 12.5 }}>
          <span style={{ fontWeight: 700 }}>{activeList.length} заявок</span>
          <div style={{ flex: 1 }} />
          {kind === 'trip' ? (
            <span style={{ color: '#6B7370' }}>
              <span style={num}>{fmt(tripKmSum)}</span> км · компенсация <b style={num}>{fmt(tripKmSum * KM_RATE)} TJS</b>
            </span>
          ) : (
            <span style={{ color: '#6B7370' }}>Сумма по выборке: <b style={num}>{fmt(activeSum)} TJS</b></span>
          )}
        </div>
      </div>

      {/* ── Шторка заявки ── */}
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
              <Badge b={dirB(dv.status)} style={{ marginTop: 2 }} />
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
                <DetailRow label="Автор" value="М. Саидова" />
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
