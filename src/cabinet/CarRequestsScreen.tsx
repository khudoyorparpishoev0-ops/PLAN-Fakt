import { useState } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import type { ApiProject, CreateRequestPayload, UploadedRef } from '../lib/api';
import { dirB, ownB, PRIORITY_LABEL, type CarCategory, type CarReq, type ReqPriorityCode, type TripReq } from '../data/cabinet';
import {
  CabBadge, CameraIcon, DropZone, FORM_LABEL, INPUT44, projectIdOf, projectOptions,
  ReceiptIcon, Select44, SubmitBtn, TD_CAB, TH_CAB,
} from './PayRequestsScreen';
import { useIsMobile } from '../lib/responsive';

export interface CarRequestsScreenProps {
  /** true — десктопные формы не показывать: на телефоне их заменяет
   *  единая форма MobileRequestForm (макет «Мобильный сотрудника»). */
  hideForm?: boolean;
  trips: TripReq[];
  cars: CarReq[];
  projects: ApiProject[];
  /** Имена контрагентов для подсказок при вводе. */
  counterparties?: string[];
  createRequest: (payload: CreateRequestPayload) => Promise<boolean>;
  toast: (msg: string) => void;
}

const CAR_CATEGORIES: CarCategory[] = ['Бензин', 'Ремонт', 'Мойка', 'Штраф', 'Запчасти'];

/** Вкладка-секция «Заявка на поездку / Расходы на авто» (прототип, строки 152–155). */
function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} className="hv-tabbar" style={{
      flex: 1, textAlign: 'center', padding: 16, fontSize: 13.5, cursor: 'pointer', minWidth: 0,
      fontWeight: active ? 700 : 500, color: active ? ACC : 'var(--fin-text-4)',
      boxShadow: active ? `inset 0 -3px 0 ${'var(--fin-accent)'}` : 'none',
    }}>{label}</div>
  );
}

export default function CarRequestsScreen({ trips, cars, projects, counterparties = [], createRequest, toast, hideForm }: CarRequestsScreenProps) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'trip' | 'expense'>('trip');

  /* ── Форма поездки ── */
  const [tProject, setTProject] = useState('');
  const [goal, setGoal] = useState('');
  const [kmStr, setKmStr] = useState('');
  const [contragent, setContragent] = useState('');
  const [priority, setPriority] = useState<ReqPriorityCode>('normal');
  const [photo, setPhoto] = useState<UploadedRef | null>(null);
  const [tripBusy, setTripBusy] = useState(false);

  const kmOk = /^\d+$/.test(kmStr.trim()) && parseInt(kmStr.trim(), 10) > 0;
  const goalOk = goal.trim().length >= 3 && goal.trim().length <= 120;
  const tripValid = tProject !== '' && goalOk && kmOk && photo != null && !tripBusy;

  const submitTrip = async () => {
    if (!tripValid) return;
    setTripBusy(true);
    const ok = await createRequest({
      kind: 'trip', projectId: projectIdOf(tProject), name: goal.trim(), km: parseInt(kmStr.trim(), 10),
      counterpartyName: contragent.trim() || undefined,
      ...(priority !== 'normal' ? { priority } : {}),
      attachment: photo ?? undefined,
    });
    setTripBusy(false);
    if (ok) { setTProject(''); setGoal(''); setKmStr(''); setContragent(''); setPhoto(null); }
  };

  /* ── Форма расхода на авто ── */
  const [aProject, setAProject] = useState('');
  const [category, setCategory] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [receipt, setReceipt] = useState<UploadedRef | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  const amount = parseFloat(amountStr.trim().replace(/\s/g, '').replace(',', '.'));
  const amountOk = /^\d[\d\s]*([.,]\d{1,2})?$/.test(amountStr.trim()) && amount > 0;
  const receiptNeeded = amountOk && amount >= 100;
  const autoValid = aProject !== '' && category !== '' && amountOk && (!receiptNeeded || receipt != null) && !autoBusy;

  const submitAuto = async () => {
    if (!autoValid) return;
    setAutoBusy(true);
    const ok = await createRequest({
      kind: 'auto', projectId: projectIdOf(aProject), name: category, category: category as CarCategory,
      amount, attachment: receipt ?? undefined,
    });
    setAutoBusy(false);
    if (ok) { setAProject(''); setCategory(''); setAmountStr(''); setReceipt(null); }
  };

  return (
    <div data-screen-label="Заявки на машину" style={{ maxWidth: 1120, animation: 'cabFade .2s ease' }}>
      {/* ── Вкладки (прототип, строки 152–155) ── */}
      <div style={{ display: 'flex', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        <SectionTab active={tab === 'trip'} label="ЗАЯВКА НА ПОЕЗДКУ" onClick={() => setTab('trip')} />
        <SectionTab active={tab === 'expense'} label="РАСХОДЫ НА АВТО" onClick={() => setTab('expense')} />
      </div>

      {tab === 'trip' && (
        <div>
          {!hideForm && (
          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em', marginBottom: 18 }}>СОЗДАТЬ ЗАЯВКУ НА ПОЕЗДКУ</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 22px' }}>
              <div>
                <label style={FORM_LABEL}>1) Проект</label>
                <Select44 value={tProject} onChange={setTProject}>
                  {projectOptions(projects)}
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
                    <DropZone height={44} label="Загрузить фото Км" icon={<CameraIcon s={17} />} value={photo} onChange={setPhoto} toast={toast} />
                  </div>
                </div>
              </div>
              <div>
                <label style={FORM_LABEL}>4) Контрагент</label>
                <input
                  data-trip-counterparty list="cab-counterparties-trip" value={contragent}
                  onChange={(e) => setContragent(e.target.value)} maxLength={200}
                  placeholder="Из справочника или текстом" style={INPUT44}
                />
                <datalist id="cab-counterparties-trip">
                  {counterparties.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label style={FORM_LABEL}>5) Срочность</label>
                <select data-trip-priority value={priority} onChange={(e) => setPriority(e.target.value as ReqPriorityCode)} style={{ ...INPUT44, padding: '0 10px' }}>
                  <option value="normal">{PRIORITY_LABEL.normal}</option>
                  <option value="high">{PRIORITY_LABEL.high}</option>
                  <option value="low">{PRIORITY_LABEL.low}</option>
                </select>
              </div>
            </div>
            <SubmitBtn label="Отправить Директору" disabled={!tripValid} onClick={submitTrip} />
          </div>
          )}
          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid var(--fin-divider)' }}>МОИ ЗАЯВКИ НА МАШИНУ</div>
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
                    <td style={{ ...TD_CAB, padding: '13px 20px', fontSize: 12.5, color: 'var(--fin-text-2)', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, fontWeight: 500 }}>{r.goal}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(r.km)} км</td>
                    <td style={TD_CAB}><CabBadge b={ownB(r.status)} /></td>
                    <td style={{ ...TD_CAB, padding: '13px 20px 13px 14px' }}><CabBadge b={dirB(r.status, r.storno)} /></td>
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
          {!hideForm && (
          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em', marginBottom: 18 }}>ДОБАВИТЬ РАСХОД НА АВТО</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 22px' }}>
              <div>
                <label style={FORM_LABEL}>1) Проект</label>
                <Select44 value={aProject} onChange={setAProject}>
                  {projectOptions(projects)}
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
                {/* Учёт в одной валюте: вместо выбора — неизменяемая подпись TJS */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0"
                    style={{ ...INPUT44, flex: 1, width: 'auto', ...num }} />
                  <span style={{
                    width: 92, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface-alt)',
                    color: 'var(--fin-text-4)', fontWeight: 600, fontSize: 14, ...num,
                  }}>TJS</span>
                </div>
              </div>
              <div>
                <label style={FORM_LABEL}>4) Чек / документ</label>
                <DropZone height={44} label="Загрузить чек" icon={<ReceiptIcon />} value={receipt} onChange={setReceipt} toast={toast} />
                {receiptNeeded && receipt == null && (
                  <div style={{ fontSize: 11.5, color: 'var(--fin-minus)', marginTop: 6 }}>Для суммы от 100 TJS чек обязателен</div>
                )}
              </div>
            </div>
            <SubmitBtn label="Отправить Директору" disabled={!autoValid} onClick={submitAuto} />
          </div>
          )}
          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid var(--fin-divider)' }}>МОИ РАСХОДЫ НА АВТО</div>
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
                    <td style={{ ...TD_CAB, padding: '13px 20px', fontSize: 12.5, color: 'var(--fin-text-2)', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, fontWeight: 500 }}>{r.category}</td>
                    <td style={{ ...TD_CAB, fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(r.amount)} {r.currency}</td>
                    <td style={TD_CAB}><CabBadge b={ownB(r.status)} /></td>
                    <td style={{ ...TD_CAB, padding: '13px 20px 13px 14px' }}><CabBadge b={dirB(r.status, r.storno)} /></td>
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
