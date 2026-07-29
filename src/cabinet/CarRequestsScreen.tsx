import { useState, type CSSProperties } from 'react';
import { num } from '../theme';
import { fmt } from '../lib/format';
import { AccentBtn, Badge, Th } from '../components/ui';
import { CABINET_PROJECTS, dirB, ownB, type CarCategory, type CarReq, type TripReq } from '../data/cabinet';

export interface CarRequestsScreenProps {
  trips: TripReq[];
  cars: CarReq[];
  addTrip: (r: TripReq) => void;
  addCar: (r: CarReq) => void;
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

const CAR_CATEGORIES: CarCategory[] = ['Бензин', 'Ремонт', 'Мойка', 'Штраф', 'Запчасти'];

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

/** Сегмент-контрол переключения вкладок (паттерн прототипа, строки 603–606). */
function Segment({ tab, setTab }: { tab: 'trip' | 'auto'; setTab: (t: 'trip' | 'auto') => void }) {
  const item = (key: 'trip' | 'auto', label: string) => {
    const on = tab === key;
    return (
      <div
        key={key}
        onClick={() => setTab(key)}
        style={{
          padding: '5px 18px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
          ...(on
            ? { fontWeight: 600, background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }
            : { fontWeight: 500, color: '#6B7370' }),
        }}
      >
        {label}
      </div>
    );
  };
  return (
    <div style={{ display: 'inline-flex', background: '#EBEAE4', padding: 3, borderRadius: 9, gap: 2, marginBottom: 14 }}>
      {item('trip', 'Заявка на поездку')}
      {item('auto', 'Расходы на авто')}
    </div>
  );
}

export default function CarRequestsScreen({ trips, cars, addTrip, addCar, toast }: CarRequestsScreenProps) {
  const [tab, setTab] = useState<'trip' | 'auto'>('trip');

  /* ── Вкладка «Заявка на поездку» ── */
  const [tProject, setTProject] = useState('');
  const [goal, setGoal] = useState('');
  const [kmStr, setKmStr] = useState('');
  const [contragent, setContragent] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);

  const goalOk = goal.trim().length >= 3 && goal.trim().length <= 120;
  const km = parseInt(kmStr.trim(), 10);
  const kmOk = /^\d+$/.test(kmStr.trim()) && km > 0;
  const tripValid = tProject !== '' && goalOk && kmOk && photoAttached;

  const submitTrip = () => {
    if (!tripValid) return;
    const maxN = trips.reduce((m, r) => Math.max(m, parseInt(r.id.replace(/\D+/g, ''), 10) || 0), 0);
    const id = 'П-' + (maxN + 1);
    addTrip({
      id, date: '29.10.2026', project: tProject, goal: goal.trim(),
      km: parseInt(kmStr, 10), contragent: contragent.trim() || '—',
      status: 'Отправлено', photo: 'одометр_2910.jpg',
    });
    toast('Заявка ' + id + ' отправлена Директору');
    setTProject(''); setGoal(''); setKmStr(''); setContragent(''); setPhotoAttached(false);
  };

  /* ── Вкладка «Расходы на авто» ── */
  const [aProject, setAProject] = useState('');
  const [category, setCategory] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState('TJS');
  const [receiptAttached, setReceiptAttached] = useState(false);

  const amountOk = /^\d+([.,]\d{1,2})?$/.test(amountStr.trim()) && parseFloat(amountStr.trim().replace(',', '.')) > 0;
  const amountVal = amountOk ? parseFloat(amountStr.trim().replace(',', '.')) : 0;
  const receiptNeeded = amountOk && amountVal >= 100;
  const carValid = aProject !== '' && category !== '' && amountOk && (!receiptNeeded || receiptAttached);

  const submitCar = () => {
    if (!carValid) return;
    const maxN = cars.reduce((m, r) => Math.max(m, parseInt(r.id.replace(/\D+/g, ''), 10) || 0), 0);
    const id = 'А-' + (maxN + 1);
    addCar({
      id, date: '29.10.2026', project: aProject, category: category as CarCategory,
      amount: amountVal, currency, status: 'Отправлено',
      receipt: receiptAttached ? 'чек_2910.jpg' : undefined,
    });
    toast('Заявка ' + id + ' отправлена Директору');
    setAProject(''); setCategory(''); setAmountStr(''); setCurrency('TJS'); setReceiptAttached(false);
  };

  return (
    <div data-screen-label="Заявки на машину">
      <Segment tab={tab} setTab={setTab} />

      {tab === 'trip' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16, alignItems: 'start' }}>
          {/* ── Форма новой заявки на поездку ── */}
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Новая заявка на поездку</div>

            <div style={{ marginBottom: 10 }}>
              <div style={LAB}>Проект <Req /></div>
              <select value={tProject} onChange={(e) => setTProject(e.target.value)} style={SEL}>
                <option value="">Выберите проект</option>
                {CABINET_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={LAB}>Цель поездки <Req /></div>
              <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120}
                placeholder="Например, доставка креплений на объект" style={INP} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={LAB}>Км <Req /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input value={kmStr} onChange={(e) => setKmStr(e.target.value)} placeholder="0"
                  style={{ ...INP, ...num, textAlign: 'right' }} />
                <input value={contragent} onChange={(e) => setContragent(e.target.value)}
                  placeholder="Из справочника или текстом" style={INP} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={LAB}>Фото одометра <Req /></div>
              {photoAttached ? (
                <div style={{ display: 'flex' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #E7E5E0', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 500 }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5">
                      <path d="M2 4.5h1.5L4.5 3h5l1 1.5H12v7H2z" />
                      <circle cx="7" cy="8" r="2" />
                    </svg>
                    одометр_2910.jpg
                    <span onClick={() => setPhotoAttached(false)} className="hv-cream"
                      style={{ width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}>
                      <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                    </span>
                  </span>
                </div>
              ) : (
                <div onClick={() => setPhotoAttached(true)} className="hv-paper"
                  style={{ border: '1.5px dashed #D8D5CE', borderRadius: 10, padding: 18, textAlign: 'center', color: '#8A918D', fontSize: 12.5, cursor: 'pointer' }}>
                  Фото одометра — обязательно<br />
                  <span style={{ fontSize: 11.5, color: '#A6ACA8' }}>JPG · PNG до 10 МБ</span>
                </div>
              )}
            </div>

            <AccentBtn onClick={submitTrip} style={{
              width: '100%', justifyContent: 'center',
              ...(tripValid ? {} : { opacity: 0.45, pointerEvents: 'none', cursor: 'default' }),
            }}>
              Отправить на утверждение Директору
            </AccentBtn>
            <div style={{ fontSize: 11.5, color: '#A6ACA8', lineHeight: 1.5, marginTop: 10 }}>
              После отправки заявка попадёт к Директору на утверждение. Редактировать можно только черновики и отклонённые заявки.
            </div>
          </div>

          {/* ── Мои поездки ── */}
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 12px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Мои поездки</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12, color: '#8A918D' }}>Полный список — в разделе «Список всего / История»</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th style={{ paddingLeft: 16 }}>Дата</Th>
                  <Th>Проект</Th>
                  <Th>Цель</Th>
                  <Th right>Км</Th>
                  <Th>Контрагент</Th>
                  <Th>Статус</Th>
                  <Th style={{ paddingRight: 16 }}>Директор</Th>
                </tr>
              </thead>
              <tbody>
                {trips.map((r) => (
                  <tr key={r.id} className="hv-row">
                    <td style={{ ...num, padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.goal}</td>
                    <td style={{ ...num, padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fmt(r.km)}<span style={{ fontSize: 10.5, fontWeight: 500, color: '#A6ACA8' }}> км</span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.contragent}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', whiteSpace: 'nowrap' }}><Badge b={ownB(r.status)} /></td>
                    <td style={{ padding: '10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED', whiteSpace: 'nowrap' }}><Badge b={dirB(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'auto' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16, alignItems: 'start' }}>
          {/* ── Форма нового расхода на авто ── */}
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Новый расход на авто</div>

            <div style={{ marginBottom: 10 }}>
              <div style={LAB}>Проект <Req /></div>
              <select value={aProject} onChange={(e) => setAProject(e.target.value)} style={SEL}>
                <option value="">Выберите проект</option>
                {CABINET_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={LAB}>Категория <Req /></div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={SEL}>
                <option value="">Выберите категорию</option>
                {CAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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

            <div style={{ marginBottom: 6 }}>
              <div style={LAB}>Чек</div>
              {receiptAttached ? (
                <div style={{ display: 'flex' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #E7E5E0', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 500 }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /></svg>
                    чек_2910.jpg
                    <span onClick={() => setReceiptAttached(false)} className="hv-cream"
                      style={{ width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}>
                      <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                    </span>
                  </span>
                </div>
              ) : (
                <div onClick={() => setReceiptAttached(true)} className="hv-paper"
                  style={{ border: '1.5px dashed #D8D5CE', borderRadius: 10, padding: 18, textAlign: 'center', color: '#8A918D', fontSize: 12.5, cursor: 'pointer' }}>
                  Прикрепите чек<br />
                  <span style={{ fontSize: 11.5, color: '#A6ACA8' }}>обязателен для сумм от 100 TJS</span>
                </div>
              )}
            </div>

            {receiptNeeded && !receiptAttached && (
              <div style={{ fontSize: 11.5, color: '#B93227', marginBottom: 8 }}>Для суммы от 100 TJS чек обязателен</div>
            )}

            <div style={{ marginTop: 8 }}>
              <AccentBtn onClick={submitCar} style={{
                width: '100%', justifyContent: 'center',
                ...(carValid ? {} : { opacity: 0.45, pointerEvents: 'none', cursor: 'default' }),
              }}>
                Отправить на утверждение Директору
              </AccentBtn>
            </div>
            <div style={{ fontSize: 11.5, color: '#A6ACA8', lineHeight: 1.5, marginTop: 10 }}>
              После отправки заявка попадёт к Директору на утверждение. Редактировать можно только черновики и отклонённые заявки.
            </div>
          </div>

          {/* ── Мои расходы на авто ── */}
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 12px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Мои расходы на авто</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12, color: '#8A918D' }}>Полный список — в разделе «Список всего / История»</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th style={{ paddingLeft: 16 }}>Дата</Th>
                  <Th>Проект</Th>
                  <Th>Категория</Th>
                  <Th right>Сумма</Th>
                  <Th>Чек</Th>
                  <Th>Статус</Th>
                  <Th style={{ paddingRight: 16 }}>Директор</Th>
                </tr>
              </thead>
              <tbody>
                {cars.map((r) => (
                  <tr key={r.id} className="hv-row">
                    <td style={{ ...num, padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E', whiteSpace: 'nowrap' }}>{r.project}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.category}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', textAlign: 'right', whiteSpace: 'nowrap' }}><Money amount={r.amount} currency={r.currency} /></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED' }}>
                      {r.receipt ? (
                        <span title={r.receipt} style={{ display: 'inline-flex' }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#8A918D" strokeWidth="1.5">
                            <path d="M3 1.5h6L11.5 4v8.5h-8.5z" />
                          </svg>
                        </span>
                      ) : (
                        <span style={{ color: '#A6ACA8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', whiteSpace: 'nowrap' }}><Badge b={ownB(r.status)} /></td>
                    <td style={{ padding: '10px 12px', paddingRight: 16, borderBottom: '1px solid #F3F2ED', whiteSpace: 'nowrap' }}><Badge b={dirB(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
