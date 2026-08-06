import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import { api, ApiError, type ApiProject, type CreateRequestPayload, type UploadedRef } from '../lib/api';
import { dirB, ownB, PRIORITY_LABEL, type PayReq, type ReqPriorityCode } from '../data/cabinet';
import { useIsMobile } from '../lib/responsive';
import { BASE_CURRENCY, rateOf, type CurrencyRow } from '../lib/currency';
import { CurrencySelect } from '../components/ui';

export interface PayRequestsScreenProps {
  /** true — десктопную форму не показывать: на телефоне её заменяет
   *  единая форма MobileRequestForm (макет «Мобильный сотрудника»). */
  hideForm?: boolean;
  pays: PayReq[];
  projects: ApiProject[];
  /** Имена контрагентов для подсказок при вводе (GET /counterparty-names). */
  counterparties?: string[];
  /** Справочник валют с курсами (GET /currencies). */
  currencies?: CurrencyRow[];
  createRequest: (payload: CreateRequestPayload) => Promise<boolean>;
  toast: (msg: string) => void;
}

/** Селект проекта: значение — id проекта из БД, '' — не выбран, 'none' — «Без проекта». */
export function projectOptions(projects: ApiProject[]) {
  return (
    <>
      <option value="">Выберите проект</option>
      {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
      <option value="none">Без проекта</option>
    </>
  );
}

/** Выбранное значение селекта → projectId для API. */
export const projectIdOf = (v: string): number | undefined => (v === 'none' || v === '' ? undefined : Number(v));

/* ── Стили полей формы — 1:1 из прототипа кабинета (строки 100–116) ── */
export const FORM_LABEL: CSSProperties = { fontSize: 12.5, color: 'var(--fin-text-2)', fontWeight: 500, marginBottom: 7, display: 'block' };
export const SELECT44: CSSProperties = { width: '100%', height: 44, border: '1px solid var(--fin-border)', borderRadius: 10, padding: '0 34px 0 13px', fontSize: 13.5, background: 'var(--fin-surface)', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' };
export const INPUT44: CSSProperties = { width: '100%', height: 44, border: '1px solid var(--fin-border)', borderRadius: 10, padding: '0 13px', fontSize: 13.5, background: 'var(--fin-surface)', outline: 'none' };

/** Select 44px с собственной стрелкой ▾ (appearance: none — паттерн прототипа). */
export function Select44({ value, onChange, children, style }: {
  value: string; onChange: (v: string) => void; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={SELECT44}>{children}</select>
      <span style={{ position: 'absolute', right: 14, top: 15, pointerEvents: 'none', color: 'var(--fin-text-5)' }}>▾</span>
    </div>
  );
}

/** Дашед-зона загрузки файла: клик открывает выбор файла, файл сразу
 *  уходит в хранилище (POST /api/uploads, JPG/PNG/PDF до 10 МБ);
 *  повторный клик по загруженному — открепляет. */
export function DropZone({ height, label, icon, value, onChange, toast }: {
  height: number; label: string; icon: ReactNode;
  value: UploadedRef | null;
  onChange: (v: UploadedRef | null) => void;
  toast: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const attached = value != null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('Файл больше 10 МБ'); return; }
    setBusy(true);
    try {
      onChange(await api.upload(file));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось загрузить файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={busy ? undefined : () => (attached ? onChange(null) : inputRef.current?.click())}
      className={attached ? undefined : 'hv-drop'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height,
        border: attached ? `1px solid ${'var(--fin-border)'}` : '1px dashed var(--fin-border)', borderRadius: 10,
        background: 'var(--fin-surface-alt)', fontSize: 13, color: attached ? 'var(--fin-text)' : 'var(--fin-text-2)', cursor: busy ? 'default' : 'pointer', fontWeight: attached ? 500 : 400,
        overflow: 'hidden', padding: '0 10px', whiteSpace: 'nowrap',
      }}
    >
      <input
        ref={inputRef} type="file" style={{ display: 'none' }}
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {busy ? 'Загрузка…' : attached ? value.fileName : label}
      </span>
      {attached && !busy && (
        <span style={{ width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fin-text-3)', flex: 'none' }}>
          <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
        </span>
      )}
    </div>
  );
}

export const CameraIcon = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="4" width="13" height="9.5" rx="1.8" /><circle cx="8" cy="8.7" r="2.4" /><path d="M5.5 4l1-1.6h3L10.5 4" /></svg>
);
export const ReceiptIcon = ({ s = 17 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1.5h5.5L13 5v9.5H4z" /><path d="M9 1.5V5h4" /><path d="M6 8.5h4M6 11h3" /></svg>
);
const SendIcon = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2L7 9" /><path d="M14 2l-4.5 12-2.5-5-5-2.5z" /></svg>
);

/** Кнопка отправки — 48px, radius 11, иконка-самолётик (прототип, строка 119). */
export function SubmitBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={disabled ? undefined : 'hv-dim'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 48, borderRadius: 11,
        background: ACC, color: 'var(--fin-surface)', fontSize: 14.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', marginTop: 20,
        ...(disabled ? { opacity: 0.45 } : {}),
      }}
    >
      <SendIcon /> {label}
    </div>
  );
}

/* ── Ячейки таблиц кабинета (паддинги 13/11 px — прототип, строки 124–145) ── */
export const TH_CAB: CSSProperties = { padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', color: 'var(--fin-text-4)', textAlign: 'left', borderBottom: '1px solid var(--fin-border)' };
export const TD_CAB: CSSProperties = { padding: '13px 14px', borderBottom: '1px solid var(--fin-divider)' };

/** Статус-бейдж кабинета (gap 6, паддинг 3px 10px — прототип). */
/** Метка срочной заявки — общая для кабинета и очереди директора.
 *  Показывается только у «Срочно»: пометка на каждой строке перестаёт
 *  выделять что-либо. */
export function PriorityChip({ compact }: { compact?: boolean } = {}) {
  return (
    <span data-priority-chip style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 7,
      padding: compact ? '1px 6px' : '2px 7px', borderRadius: 99,
      background: 'var(--fin-minus-soft)', color: 'var(--fin-minus)',
      fontSize: compact ? 10.5 : 11, fontWeight: 700, letterSpacing: '.02em',
      verticalAlign: 'middle', whiteSpace: 'nowrap',
    }}>Срочно</span>
  );
}

export function CabBadge({ b }: { b: { t: string; fg: string; bg: string; dot: string } }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, color: b.fg, background: b.bg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.dot }} />{b.t}
    </span>
  );
}


export default function PayRequestsScreen({ pays, projects, counterparties = [], currencies = [], createRequest, toast, hideForm }: PayRequestsScreenProps) {
  const isMobile = useIsMobile();
  const [project, setProject] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [name, setName] = useState('');
  const [contragent, setContragent] = useState('');
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [priority, setPriority] = useState<ReqPriorityCode>('normal');
  const [doc, setDoc] = useState<UploadedRef | null>(null);
  const [busy, setBusy] = useState(false);

  const amountOk = /^\d[\d\s]*([.,]\d{1,2})?$/.test(amountStr.trim()) && parseFloat(amountStr.trim().replace(/\s/g, '').replace(',', '.')) > 0;
  const nameOk = name.trim().length >= 3 && name.trim().length <= 200;
  const valid = project !== '' && amountOk && nameOk && !busy;
  /* Курса нет — заявку принимаем (её ещё может одобрить не сегодня), но
     предупреждаем: одобрение без курса упрётся в 422 у директора. */
  const noRate = currency !== BASE_CURRENCY && rateOf(currencies, currency) == null;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await createRequest({
      kind: 'payment', projectId: projectIdOf(project), name: name.trim(),
      amount: parseFloat(amountStr.trim().replace(/\s/g, '').replace(',', '.')),
      currency,
      counterpartyName: contragent.trim() || undefined,
      // Обычную срочность не шлём: сервер и так ставит её по умолчанию
      ...(priority !== 'normal' ? { priority } : {}),
      attachment: doc ?? undefined,
    });
    setBusy(false);
    if (ok) { setProject(''); setAmountStr(''); setName(''); setContragent(''); setPriority('normal'); setDoc(null); setCurrency(BASE_CURRENCY); }
  };

  return (
    <div data-screen-label="Заявки на оплату" style={{ maxWidth: 1120, animation: 'cabFade .2s ease' }}>
      {/* ── Форма (прототип, строки 96–120) ── */}
      {!hideForm && (
      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em', marginBottom: 18 }}>СОЗДАТЬ ЗАЯВКУ НА ОПЛАТУ</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 22px' }}>
          <div>
            <label style={FORM_LABEL}>1) Проект</label>
            <Select44 value={project} onChange={setProject}>
              {projectOptions(projects)}
            </Select44>
          </div>
          <div>
            <label style={FORM_LABEL}>2) Сумма и валюта</label>
            {/* Валюта выбирается: заказчик 06.08.2026 отменил решение 02.
                Отчёты по-прежнему в сомони — пересчёт идёт по курсу на дату. */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0"
                style={{ ...INPUT44, flex: 1, width: 'auto', ...num }} />
              <CurrencySelect
                value={currency} onChange={setCurrency} list={currencies} dataAttr="data-pay-currency"
                style={{ ...INPUT44, width: 168, flex: 'none', padding: '0 8px' }}
              />
            </div>
            {noRate && (
              <div style={{ fontSize: 11.5, color: 'var(--fin-warn)', marginTop: 6, lineHeight: 1.4 }}>
                Курс {currency} к сомони пока не задан. Заявку отправить можно, но одобрить её
                директор сможет только после того, как администратор внесёт курс.
              </div>
            )}
          </div>
          <div>
            <label style={FORM_LABEL}>3) Наименование</label>
            <textarea value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="За что платим (3–200 символов)"
              style={{ width: '100%', height: 88, border: '1px solid var(--fin-border)', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, background: 'var(--fin-surface)', outline: 'none', resize: 'none', lineHeight: 1.5 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              {/* Кому платим: свободный ввод со подсказками из справочника —
                  одобрение заявки заводит контрагента, и разнопись плодит двойников */}
              <label style={FORM_LABEL}>4) Контрагент (получатель)</label>
              <input
                data-pay-counterparty list="cab-counterparties" value={contragent}
                onChange={(e) => setContragent(e.target.value)} maxLength={200}
                placeholder="Кому платим — необязательно" style={INPUT44}
              />
              <datalist id="cab-counterparties">
                {counterparties.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              {/* Срочность: директор разбирает очередь сверху вниз, и «Срочно»
                  поднимает заявку — поэтому выбор в форме, а не отдельным экраном */}
              <label style={FORM_LABEL}>5) Срочность</label>
              <select data-pay-priority value={priority} onChange={(e) => setPriority(e.target.value as ReqPriorityCode)} style={{ ...INPUT44, padding: '0 10px' }}>
                <option value="normal">{PRIORITY_LABEL.normal}</option>
                <option value="high">{PRIORITY_LABEL.high}</option>
                <option value="low">{PRIORITY_LABEL.low}</option>
              </select>
            </div>
            <div>
              <label style={FORM_LABEL}>6) Документ (опционально)</label>
              <DropZone height={88} label="Загрузить счёт" icon={<CameraIcon />} value={doc} onChange={setDoc} toast={toast} />
            </div>
          </div>
        </div>
        <SubmitBtn label="Отправить на утверждение Директору" disabled={!valid} onClick={submit} />
      </div>
      )}

      {/* ── Мои последние заявки (прототип, строки 122–146) ── */}
      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid var(--fin-divider)' }}>МОИ ПОСЛЕДНИЕ ЗАЯВКИ</div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...TH_CAB, padding: '11px 20px' }}>Дата</th>
            <th style={TH_CAB}>Проект</th>
            <th style={TH_CAB}>Наименование</th>
            <th style={{ ...TH_CAB, textAlign: 'right' }}>Сумма</th>
            <th style={TH_CAB}>Статус</th>
            <th style={{ ...TH_CAB, padding: '11px 20px 11px 14px' }}>Директор</th>
          </tr></thead>
          <tbody>
            {pays.slice(0, 10).map((r) => (
              <tr key={r.id} className="hv-row">
                <td style={{ ...TD_CAB, padding: '13px 20px', fontSize: 12.5, color: 'var(--fin-text-2)', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>{r.date}</td>
                <td style={{ ...TD_CAB, fontSize: 12.5, color: 'var(--fin-text-2)' }}>{r.project}</td>
                <td style={{ ...TD_CAB, fontSize: 13, fontWeight: 500 }}>
                  {r.priority === 'high' && <PriorityChip />}
                  {r.name}
                  {r.contragent && (
                    <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--fin-text-4)', marginTop: 2 }}>{r.contragent}</div>
                  )}
                </td>
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
  );
}
