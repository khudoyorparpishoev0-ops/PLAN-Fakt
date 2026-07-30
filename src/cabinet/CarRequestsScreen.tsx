import { useState } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import { CABINET_PROJECTS, dirB, ownB, type CarCategory, type CarReq, type TripReq } from '../data/cabinet';
import { CabBadge, CameraIcon, DropZone, FORM_LABEL, INPUT44, ReceiptIcon, Select44, SubmitBtn, TD_CAB, TH_CAB } from './PayRequestsScreen';

export interface CarRequestsScreenProps {
  trips: TripReq[];
  cars: CarReq[];
  addTrip: (r: TripReq) => void;
  addCar: (r: CarReq) => void;
  toast: (msg: string) => void;
}

const CAR_CATEGORIES: CarCategory[] = ['Бензин', 'Ремонт', 'Мойка', 'Штраф', 'Запчасти'];

/** Вкладка-секция «Заявка на поездку / Расходы на авто» (прототип, строки 152–155). */
function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} className="hv-tabbar" style={{
      flex: 1, textAlign: 'center', padding: 16, fontSize: 13.5, cursor: 'pointer',
      fontWeight: active ? 700 : 500, color: active ? ACC : '#8A918D',
      boxShadow: active ? `inset 0 -3px 0 ${'var(--fin-accent,#1B7A3C)'}` : 'none',
    }}>{label}</div>
  );
}

export default function CarRequestsScreen({ trips, cars, addTrip, addCar, toast }: CarRequestsScreenProps) {
  const [tab, setTab] = useState<'trip' | 'expense'>('trip');

  /* ── Форма поездки ── */
  const [tProject, setTProject] = useState('');
  const [goal, setGoal] = useState('');
  const [kmStr, setKmStr] = useState('');
  const [contragent, setContragent] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);

  const kmOk = /^\d+$/.test(kmStr.trim()) && parseInt(kmStr.trim(), 10) > 0;
  const goalOk = goal.trim().length >= 3 && goal.trim().length <= 120;
  const tripValid = tProject !== '' && goalOk && kmOk && photoAttached;

  const submitTrip = () => {
    if (!tripValid) return;
    const maxN = trips.reduce((m, p) => Math.max(m, parseInt(p.id.replace(/\D+/g, ''), 10) || 0), 0);
    const id = 'П-' + (maxN + 1);
    addTrip({
      id, date: '29.10.2026', project: tProject, goal: goal.trim(), km: parseInt(kmStr.trim(), 10),
      contragent: contragent.trim() || '—', status: 'Отправлено', photo: 'одометр_2910.jpg',
    });
    toast('Заявка ' + id + ' отправлена Директору');
    setTProject(''); setGoal(''); setKmStr(''); setContragent(''); setPhotoAttached(false);
  };

  /* ── Форма расхода на авто ── */
  const [aProject, setAProject] = useState('');
  const [category, setCategory] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState('TJS');
  const [receiptAttached, setReceiptAttached] = useState(false);

  const amount = parseFloat(amountStr.trim().replace(/\s/g, '').replace(',', '.'));
  const amountOk = /^\d[\d\s]*([.,]\d{1,2})?$/.test(amountStr.trim()) && amount > 0;
  const receiptNeeded = amountOk && amount >= 100;
  const autoValid = aProject !== '' && category !== '' && amountOk && (!receiptNeeded || receiptAttached);

  const submitAuto = () => {
    if (!autoValid) return;
    const maxN = cars.reduce((m, p) => Math.max(m, parseInt(p.id.replace(/\D+/g, ''), 10) || 0), 0);
    const id = 'А-' + (maxN + 1);
    addCar({
      id, date: '29.10.2026', project: aProject, category: category as CarCategory, amount, currency,
      status: 'Отправлено', receipt: receiptAttached ? 'чек_2910.jpg' : undefined,
    });
    toast('Заявка ' + id + ' отправлена Директору');
    setAProject(''); setCategory(''); setAmountStr(''); setCurrency('TJS'); setReceiptAttached(false);
  };

  return (
    <div data-screen-label="Заявки на машину" style={{ maxWidth: 1120, animation: 'cabFade .2s ease' }}>
      {/* ── Вкладки (прототип, строки 152–155) ── */}
      <div style={{ display: 'flex', background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        <SectionTab active={tab === 'trip'} label="ЗАЯВКА НА ПОЕЗДКУ" onClick={() => setTab('trip')} />
        <SectionTab active={tab === 'expense'} label="РАСХОДЫ НА АВТО" onClick={() => setTab('expense')} />
      </div>

      {tab === 'trip' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em', marginBottom: 18 }}>СОЗДАТЬ ЗАЯВКУ НА ПОЕЗДКУ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 22px' }}>
              <div>
                <label style={FORM_LABEL}>1) Проект</label>
                <Select44 value={tProject} onChange={setTProject}>
                  <option value="">Выберите проект</option>
                  {CABINET_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select44>
              </div>
              <div>
                <label style={FORM_LABEL}>2) Цель поездки</label>
                <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} placeholder="Например, встреча с клиентом" style={INPUT44} />
              </div>
              <div>
                <label style={FORM_LABEL}>3) Км (закрепить фото)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={kmStr} onChange={(e) => setKmStr(e.target.value)} placeholder="0"
                    style={{ ...INPUT44, width: 96, flex: 'none', ...num }} />
                  <div style={{ flex: 1 }}>
                    <DropZone height={44} label="Загрузить фото Км" icon={<CameraIcon s={17} />} attached={photoAttached} attachedName="одометр_2910.jpg" onToggle={() => setPhotoAttached(a => !a)} />
                  </div>
                </div>
              </div>
              <div>
                <label style={FORM_LABEL}>4) Контрагент</label>
                <input value={contragent} onChange={(e) => setContragent(e.target.value)} placeholder="Из справочника или текстом" style={INPUT44} />
              </div>
            </div>
            <SubmitBtn label="Отправить Директору" disabled={!tripValid} onClick={submitTrip} />
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid #F0EFEA' }}>МОИ ЗАЯВКИ НА МАШИНУ</div>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...TH_CAB, padding: '11px 20px' }}>Дата</th>
                <th style={TH_CAB}>Цель</th>
                <th style={{ ...TH_CAB, textAlign: 'right' }}>Км</th>
                <th style={TH_CAB}>Статус</th>
                <th style={{ ...TH_CAB, padding: '11px 20px 11px 14px' }}>Директор</th>
              </tr></thead>
              <tbody>
                {trips.map((r) => (
                  <tr key={r.id} className="hv-row">
                    <td style={{ ...TD_CAB, padding: '13px 20px', fontSize: 12.5, color: '#3E4643', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, fontWeight: 500 }}>{r.goal}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(r.km)} км</td>
                    <td style={TD_CAB}><CabBadge b={ownB(r.status)} /></td>
                    <td style={{ ...TD_CAB, padding: '13px 20px 13px 14px' }}><CabBadge b={dirB(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'expense' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em', marginBottom: 18 }}>ДОБАВИТЬ РАСХОД НА АВТО</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 22px' }}>
              <div>
                <label style={FORM_LABEL}>1) Проект</label>
                <Select44 value={aProject} onChange={setAProject}>
                  <option value="">Выберите проект</option>
                  {CABINET_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select44>
              </div>
              <div>
                <label style={FORM_LABEL}>2) Категория</label>
                <Select44 value={category} onChange={setCategory}>
                  <option value="">Выберите категорию</option>
                  {CAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select44>
              </div>
              <div>
                <label style={FORM_LABEL}>3) Сумма</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0"
                    style={{ ...INPUT44, flex: 1, width: 'auto', ...num }} />
                  <Select44 value={currency} onChange={setCurrency} style={{ width: 92, flex: 'none' }}>
                    <option>TJS</option><option>USD</option>
                  </Select44>
                </div>
              </div>
              <div>
                <label style={FORM_LABEL}>4) Чек / документ</label>
                <DropZone height={44} label="Загрузить чек" icon={<ReceiptIcon />} attached={receiptAttached} attachedName="чек_2910.jpg" onToggle={() => setReceiptAttached(a => !a)} />
                {receiptNeeded && !receiptAttached && (
                  <div style={{ fontSize: 11.5, color: '#B93227', marginTop: 6 }}>Для суммы от 100 TJS чек обязателен</div>
                )}
              </div>
            </div>
            <SubmitBtn label="Отправить Директору" disabled={!autoValid} onClick={submitAuto} />
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid #F0EFEA' }}>МОИ РАСХОДЫ НА АВТО</div>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...TH_CAB, padding: '11px 20px' }}>Дата</th>
                <th style={TH_CAB}>Категория</th>
                <th style={{ ...TH_CAB, textAlign: 'right' }}>Сумма</th>
                <th style={TH_CAB}>Статус</th>
                <th style={{ ...TH_CAB, padding: '11px 20px 11px 14px' }}>Директор</th>
              </tr></thead>
              <tbody>
                {cars.map((r) => (
                  <tr key={r.id} className="hv-row">
                    <td style={{ ...TD_CAB, padding: '13px 20px', fontSize: 12.5, color: '#3E4643', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, fontWeight: 500 }}>{r.category}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(r.amount)} {r.currency}</td>
                    <td style={TD_CAB}><CabBadge b={ownB(r.status)} /></td>
                    <td style={{ ...TD_CAB, padding: '13px 20px 13px 14px' }}><CabBadge b={dirB(r.status)} /></td>
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
