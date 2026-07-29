import { useState, type CSSProperties, type ReactNode } from 'react';
import { C, num } from '../theme';
import { fmt } from '../lib/format';
import { AccentBtn, Badge, Th } from '../components/ui';
import { CABINET_PROJECTS, KM_RATE, dirB, ownB, type CarReq, type PayReq, type ReqStatus, type TripReq } from '../data/cabinet';

export interface PayRequestsScreenProps {
  pays: PayReq[];
  trips: TripReq[];
  cars: CarReq[];
  addPay: (r: PayReq) => void;
  toast: (msg: string) => void;
}

/** Подпись поля формы (12px #6B7370, marginBottom 4 — паттерн прототипа). */
const LAB: CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };
const INP: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' };
const SEL: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' };

const CURRENCIES: { code: string; label: string }[] = [
  { code: 'TJS', label: 'TJS — сомони' },
  { code: 'USD', label: 'USD' },
  { code: 'EUR', label: 'EUR' },
  { code: 'RUB', label: 'RUB' },
  { code: 'CNY', label: 'CNY' },
];

const Req = () => <span style={{ color: '#B93227' }}>*</span>;

/** Сумма «12 345,00 TJS»: целая часть Plex + мелкий серый суффикс с копейками и валютой. */
function Money({ amount, currency }: { amount: number; currency: string }) {
  const cents = Math.round((amount - Math.trunc(amount)) * 100);
  return (
    <span style={{ ...num, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {fmt(Math.trunc(amount))}
      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}>,{String(cents).padStart(2, '0')} {currency}</span>
    </span>
  );
}

/** KPI-карточка по статусу заявок (визуальный паттерн карточек прототипа, строки 608–616). */
function KpiCard({ label, count, sum, color, icon }: {
  label: string; count: number; sum: number; color: { fg: string; bg: string }; icon: ReactNode;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '15px 18px', minHeight: 116, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: '#8A918D', textTransform: 'uppercase', marginBottom: 7 }}>{label}</div>
      <div style={{ ...num, fontSize: 25, fontWeight: 700, letterSpacing: '-.02em' }}>{count}</div>
      <div style={{ fontSize: 12, color: '#8A918D', marginTop: 2 }}>на <span style={num}>{fmt(sum)}</span> TJS</div>
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: color.bg, color: color.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </span>
      </div>
    </div>
  );
}

export default function PayRequestsScreen({ pays, trips, cars, addPay, toast }: PayRequestsScreenProps) {
  const [project, setProject] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState('TJS');
  const [name, setName] = useState('');
  const [attached, setAttached] = useState(false);

  /* ── KPI: счёт и суммы по статусам поверх всех трёх видов заявок ── */
  const all: { status: ReqStatus; amount: number }[] = [
    ...pays.map((p) => ({ status: p.status, amount: p.amount })),
    ...trips.map((t) => ({ status: t.status, amount: t.km * KM_RATE })),
    ...cars.map((c) => ({ status: c.status, amount: c.amount })),
  ];
  const agg = (st: ReqStatus) => {
    const rows = all.filter((r) => r.status === st);
    return { count: rows.length, sum: rows.reduce((s, r) => s + r.amount, 0) };
  };
  const kSent = agg('Отправлено'), kRev = agg('На рассмотрении'), kOk = agg('Одобрено'), kNo = agg('Отклонено');

  /* ── Валидация формы ── */
  const amountOk = /^\d+([.,]\d{1,2})?$/.test(amountStr.trim()) && parseFloat(amountStr.trim().replace(',', '.')) > 0;
  const nameOk = name.trim().length >= 3 && name.trim().length <= 200;
  const valid = project !== '' && amountOk && nameOk;

  const submit = () => {
    if (!valid) return;
    const maxN = pays.reduce((m, p) => Math.max(m, parseInt(p.id.replace(/\D+/g, ''), 10) || 0), 0);
    const id = 'З-' + (maxN + 1);
    addPay({
      id, date: '29.10.2026', project, name: name.trim(),
      amount: parseFloat(amountStr.trim().replace(',', '.')), currency,
      status: 'Отправлено', doc: attached ? 'Счёт №221.pdf' : undefined,
    });
    toast('Заявка ' + id + ' отправлена Директору');
    setProject(''); setAmountStr(''); setCurrency('TJS'); setName(''); setAttached(false);
  };

  return (
    <div data-screen-label="Заявки на оплату">
      {/* KPI-ряд: Отправлено / На рассмотрении / Одобрено / Отклонено */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Отправлено" count={kSent.count} sum={kSent.sum} color={C.blue}
          icon={<><path d="M14 2L2 6.5l5.2 2.3L14 2z" /><path d="M14 2L9.5 14 7.2 8.8" /></>} />
        <KpiCard label="На рассмотрении" count={kRev.count} sum={kRev.sum} color={C.yellow}
          icon={<><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.4 1.5" /></>} />
        <KpiCard label="Одобрено" count={kOk.count} sum={kOk.sum} color={C.green}
          icon={<path d="M3 8.5l3.4 3.4L13 4.5" />} />
        <KpiCard label="Отклонено" count={kNo.count} sum={kNo.sum} color={C.red}
          icon={<path d="M4 4l8 8M12 4l-8 8" />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── Форма новой заявки ── */}
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Новая заявка на оплату</div>

          <div style={{ marginBottom: 10 }}>
            <div style={LAB}>Проект <Req /></div>
            <select value={project} onChange={(e) => setProject(e.target.value)} style={SEL}>
              <option value="">Выберите проект</option>
              {CABINET_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={LAB}>Сумма <Req /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
              <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0,00"
                style={{ ...INP, ...num, textAlign: 'right' }} />
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={SEL}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={LAB}>Наименование <Req /></div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200}
              placeholder="За что платим (3–200 символов)" style={INP} />
            <div style={{ fontSize: 11, color: '#A6ACA8', marginTop: 3 }}><span style={num}>{name.length} / 200</span></div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={LAB}>Документ</div>
            {attached ? (
              <div style={{ display: 'flex' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #E7E5E0', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 500 }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /></svg>
                  Счёт №221.pdf
                  <span onClick={() => setAttached(false)} className="hv-cream"
                    style={{ width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}>
                    <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                  </span>
                </span>
              </div>
            ) : (
              <div onClick={() => setAttached(true)} className="hv-paper"
                style={{ border: '1.5px dashed #D8D5CE', borderRadius: 10, padding: 18, textAlign: 'center', color: '#8A918D', fontSize: 12.5, cursor: 'pointer' }}>
                Перетащите файл или нажмите<br />
                <span style={{ fontSize: 11.5, color: '#A6ACA8' }}>счёт · договор · чек · JPG · PNG · PDF до 10 МБ</span>
              </div>
            )}
          </div>

          <AccentBtn onClick={submit} style={{
            width: '100%', justifyContent: 'center',
            ...(valid ? {} : { opacity: 0.45, pointerEvents: 'none', cursor: 'default' }),
          }}>
            Отправить на утверждение Директору
          </AccentBtn>
          <div style={{ fontSize: 11.5, color: '#A6ACA8', lineHeight: 1.5, marginTop: 10 }}>
            После отправки заявка попадёт к Директору на утверждение. Редактировать можно только черновики и отклонённые заявки.
          </div>
        </div>

        {/* ── Мои последние заявки ── */}
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Мои последние заявки</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: '#8A918D' }}>Полный список — в разделе «Список всего / История»</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th style={{ paddingLeft: 16 }}>Дата</Th>
                <Th>Проект</Th>
                <Th>Наименование</Th>
                <Th right>Сумма</Th>
                <Th>Статус</Th>
                <Th style={{ paddingRight: 16 }}>Директор</Th>
              </tr>
            </thead>
            <tbody>
              {pays.slice(0, 10).map((r) => (
                <tr key={r.id} className="hv-row">
                  <td style={{ ...num, padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right' }}><Money amount={r.amount} currency={r.currency} /></td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', whiteSpace: 'nowrap' }}><Badge b={ownB(r.status)} /></td>
                  <td style={{ padding: '10px 12px 10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED', whiteSpace: 'nowrap' }}><Badge b={dirB(r.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
