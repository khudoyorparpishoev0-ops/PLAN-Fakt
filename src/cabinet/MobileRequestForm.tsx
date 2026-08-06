import { useState, type CSSProperties, type ReactNode } from 'react';
import { ACC, num } from '../theme';
import type { ApiProject, CreateRequestPayload, UploadedRef } from '../lib/api';
import type { CarCategory, ReqPriorityCode } from '../data/cabinet';
import { CameraIcon, DropZone, ReceiptIcon, projectIdOf } from './PayRequestsScreen';

export interface MobileRequestFormProps {
  /** Вид, с которого форма открывается (задаётся разделом кабинета). */
  initialKind: Kind;
  projects: ApiProject[];
  /** Имена контрагентов для подсказок при вводе. */
  counterparties?: string[];
  createRequest: (payload: CreateRequestPayload) => Promise<boolean>;
  toast: (msg: string) => void;
}

type Kind = 'payment' | 'trip' | 'auto';

const KIND_LABEL: Record<Kind, string> = { payment: 'Оплата', trip: 'Поездка', auto: 'Авто' };
const CATEGORIES: CarCategory[] = ['Бензин', 'Ремонт', 'Мойка', 'Штраф', 'Запчасти'];

/** Порог из ТЗ (п. 4.2): для авто-расхода от 100 TJS чек обязателен. */
const RECEIPT_FROM = 100;

/* ── Размеры под палец (макет «Мобильный сотрудника», 375px) ───────────── */
const ROW_H = 62;
const SUBMIT_H = 54;
/** Минимальная цель нажатия (ТЗ, п. 6 и README пакета). В самом макете
 *  переключатель вида нарисован 40px — это ниже собственного требования
 *  пакета, поэтому здесь 44. */
const TAP_MIN = 44;

const field: CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--fin-border)',
  borderRadius: 12, padding: '13px 15px', fontSize: 16, lineHeight: 1.45,
  background: 'var(--fin-surface)', outline: 'none', fontFamily: 'inherit',
};

/** Строка-кнопка «подпись + значение + шеврон» — выбор из списка по нажатию. */
function PickRow({ label, value, filled, onClick, testId }: {
  label: string; value: string; filled: boolean; onClick: () => void; testId: string;
}) {
  return (
    <button
      type="button" data-pick={testId} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        width: '100%', minHeight: ROW_H, padding: '10px 16px', boxSizing: 'border-box',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        border: '1px solid var(--fin-border)', borderRadius: 12, background: 'var(--fin-surface)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fin-text-4)' }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: filled ? 500 : 400, color: filled ? 'var(--fin-text)' : 'var(--fin-text-4)' }}>{value}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--fin-text-4)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="m9 18 6-6-6-6" /></svg>
    </button>
  );
}

/** Модальный выбор значения из списка — вместо родного select, чтобы
 *  строки были не мельче 44px и попадать пальцем было куда. */
function PickSheet({ title, items, value, onPick, onClose }: {
  title: string; items: string[]; value: string; onPick: (v: string) => void; onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80vh', overflowY: 'auto',
        background: 'var(--fin-surface)', borderRadius: '16px 16px 0 0', animation: 'finFade .15s ease',
      }}>
        <div style={{ padding: '16px 20px 10px', fontSize: 15, fontWeight: 700 }}>{title}</div>
        {items.map((i) => (
          <div
            key={i} data-pick-item={i} onClick={() => { onPick(i); onClose(); }}
            style={{
              minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px',
              borderTop: '1px solid var(--fin-divider)', cursor: 'pointer',
              fontSize: 15.5, fontWeight: i === value ? 600 : 400,
              color: i === value ? ACC : 'var(--fin-text)',
            }}
          >{i}</div>
        ))}
        <div onClick={onClose} style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--fin-border)', cursor: 'pointer', fontSize: 15.5, fontWeight: 600, color: 'var(--fin-text-3)' }}>Отмена</div>
      </div>
    </div>
  );
}

/** Форма заявки для телефона — макет «Мобильный сотрудника» (375px).
 *
 *  Три вида ТЗ (п. 4.1–4.2) в одной форме с переключателем: набор полей и
 *  правила вложений меняются по виду. Сумма — первое и самое крупное поле:
 *  её знают наизусть, всё остальное выбирается из списков.
 *
 *  Главное отличие от десктопной формы — подпись кнопки отправки называет
 *  недостающее поле. Серая кнопка без объяснения — самая частая причина
 *  брошенной формы. */
export default function MobileRequestForm({ initialKind, projects, counterparties = [], createRequest, toast }: MobileRequestFormProps) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [amountStr, setAmountStr] = useState('');
  const [text, setText] = useState('');
  const [project, setProject] = useState('');
  const [category, setCategory] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [priority, setPriority] = useState<ReqPriorityCode>('normal');
  const [file, setFile] = useState<UploadedRef | null>(null);
  const [sheet, setSheet] = useState<null | 'project' | 'category'>(null);
  const [busy, setBusy] = useState(false);

  const trip = kind === 'trip';
  const digits = amountStr.replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseFloat(digits) || 0;
  const textTrim = text.trim();
  const textOk = trip ? textTrim.length >= 3 && textTrim.length <= 120 : textTrim.length >= 3 && textTrim.length <= 200;
  const needsFile = trip || (kind === 'auto' && n >= RECEIPT_FROM);
  const projectOk = project !== '';

  /* Кнопка называет, чего не хватает — порядок проверок повторяет порядок
     полей на экране, чтобы подпись указывала на ближайшее незаполненное. */
  const missing =
    n <= 0 ? (trip ? 'Укажите километры' : 'Укажите сумму')
    : !textOk && kind !== 'auto' ? (trip ? 'Впишите цель поездки' : 'Впишите наименование')
    : !projectOk ? 'Выберите проект'
    : kind === 'auto' && !category ? 'Выберите категорию'
    : needsFile && !file ? (trip ? 'Нужно фото одометра' : `Нужен чек — сумма от ${RECEIPT_FROM} TJS`)
    : null;
  const ready = missing == null && !busy;

  const reset = () => {
    setAmountStr(''); setText(''); setProject('');
    setCategory(''); setCounterparty(''); setFile(null);
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const payload: CreateRequestPayload = trip
      ? {
          kind: 'trip', projectId: projectIdOf(project), name: textTrim, km: Math.round(n),
          counterpartyName: counterparty.trim() || undefined,
          ...(priority !== 'normal' ? { priority } : {}),
          attachment: file ?? undefined,
        }
      : kind === 'auto'
        ? {
            kind: 'auto', projectId: projectIdOf(project), name: category,
            category: category as CarCategory, amount: n, attachment: file ?? undefined,
          }
        : {
            kind: 'payment', projectId: projectIdOf(project), name: textTrim,
            amount: n, attachment: file ?? undefined,
          };
    const ok = await createRequest(payload);
    setBusy(false);
    if (ok) reset();
  };

  const attachLabel = file
    ? (trip ? 'Фото одометра приложено' : 'Документ приложен')
    : trip ? 'Сфотографировать одометр'
    : kind === 'auto' ? 'Сфотографировать чек'
    : 'Приложить документ';

  const attachHint = trip
    ? 'Фото одометра обязательно · JPG, PNG до 10 МБ'
    : kind === 'auto'
      ? (n >= RECEIPT_FROM
          ? `Чек обязателен: сумма ${RECEIPT_FROM} TJS и выше · JPG, PNG, PDF до 10 МБ`
          : `До ${RECEIPT_FROM} TJS чек можно не прикладывать`)
      : 'Счёт или договор, необязательно · JPG, PNG, PDF до 10 МБ';

  const projectNames = projects.map((p) => p.name);
  const projectLabel = project === 'none' ? 'Без проекта' : project === '' ? 'Выберите проект'
    : (projects.find((p) => String(p.id) === project)?.name ?? 'Выберите проект');

  return (
    <div data-screen-label="Новая заявка · телефон" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Переключатель вида: меняет и поля, и правила вложений ────── */}
      <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--fin-segment)', borderRadius: 11 }}>
        {(['payment', 'trip', 'auto'] as Kind[]).map((k) => {
          const on = k === kind;
          return (
            <button
              key={k} type="button" data-kind={k}
              onClick={() => { setKind(k); reset(); }}
              style={{
                flex: 1, height: TAP_MIN, border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 15, fontWeight: on ? 600 : 500,
                background: on ? 'var(--fin-surface)' : 'transparent',
                color: on ? 'var(--fin-text)' : 'var(--fin-text-2)',
                boxShadow: on ? 'var(--fin-shadow-seg)' : 'none',
              }}
            >{KIND_LABEL[k]}</button>
          );
        })}
      </div>

      {/* ── Сумма: первое и самое крупное поле ────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 0 16px', background: 'var(--fin-surface-alt)', borderRadius: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fin-text-4)' }}>{trip ? 'Километры' : 'Сумма'}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', padding: '0 24px', boxSizing: 'border-box' }}>
          <input
            data-amount value={amountStr} placeholder="0"
            onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              ...num, fontSize: 40, fontWeight: 700, color: 'var(--fin-text)', padding: 0, textAlign: 'center',
            }}
          />
          <span style={{ ...num, fontSize: 18, fontWeight: 600, color: 'var(--fin-text-4)' }}>{trip ? 'км' : 'TJS'}</span>
        </div>
      </div>

      {/* Наименование / цель: у авто-расхода его заменяет категория */}
      {kind !== 'auto' && (
        <input
          data-text value={text} onChange={(e) => setText(e.target.value)}
          maxLength={trip ? 120 : 200}
          placeholder={trip ? 'Цель поездки — 3–120 символов' : 'Наименование — за что платим'}
          style={field}
        />
      )}

      <PickRow
        testId="project" label="Проект" value={projectLabel}
        filled={projectOk} onClick={() => setSheet('project')}
      />
      {kind === 'auto' && (
        <PickRow
          testId="category" label="Категория" value={category || 'Бензин, ремонт, мойка…'}
          filled={!!category} onClick={() => setSheet('category')}
        />
      )}
      {/* Контрагент нужен и оплате (кому платим), и поездке (к кому ездили);
          у расхода на авто получатель роли не играет — там важна категория */}
      {kind !== 'auto' && (
        <>
          <input
            data-counterparty list="mob-counterparties" value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder={trip ? 'Контрагент — необязательно' : 'Кому платим — необязательно'}
            maxLength={200} style={field}
          />
          <datalist id="mob-counterparties">
            {counterparties.map((c) => <option key={c} value={c} />)}
          </datalist>
        </>
      )}

      {/* Срочность: на телефоне переключателем, а не списком — одно касание.
          «Может подождать» на телефоне не нужен: срочно или обычно. */}
      <div data-priority-switch style={{ display: 'flex', gap: 8 }}>
        {([['normal', 'Обычная'], ['high', 'Срочно']] as const).map(([v, label]) => {
          const on = priority === v;
          return (
            <button
              key={v} type="button" data-priority-btn={v} onClick={() => setPriority(v)}
              style={{
                flex: 1, height: TAP_MIN, borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${on ? (v === 'high' ? 'var(--fin-minus)' : ACC) : 'var(--fin-border)'}`,
                background: on ? (v === 'high' ? 'var(--fin-minus-soft)' : 'var(--fin-accent-soft)') : 'var(--fin-surface)',
                color: on ? (v === 'high' ? 'var(--fin-minus)' : ACC) : 'var(--fin-text-3)',
                fontSize: 14, fontWeight: on ? 700 : 500,
              }}
            >{label}</button>
          );
        })}
      </div>

      {/* ── Вложение: рамка меняется, когда файл становится обязателен ── */}
      <div style={{
        borderRadius: 12,
        outline: needsFile && !file ? '1.5px dashed var(--fin-warn)' : 'none',
        outlineOffset: -1,
      }}>
        <DropZone
          height={56} label={attachLabel}
          icon={trip ? <CameraIcon s={19} /> : <ReceiptIcon s={19} />}
          value={file} onChange={setFile} toast={toast}
        />
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: needsFile && !file ? 'var(--fin-warn)' : 'var(--fin-text-4)' }}>
        {attachHint}
      </div>

      {/* ── Отправка: подпись называет недостающее поле ───────────────── */}
      <button
        type="button" data-submit onClick={submit} disabled={!ready}
        style={{
          width: '100%', height: SUBMIT_H, border: 'none', borderRadius: 14, fontFamily: 'inherit',
          fontSize: 17, fontWeight: 600, cursor: ready ? 'pointer' : 'default',
          background: ready ? ACC : 'var(--fin-segment)',
          color: ready ? 'var(--fin-surface)' : 'var(--fin-text-4)',
        }}
      >{busy ? 'Отправляем…' : (missing ?? 'Отправить директору')}</button>

      {sheet === 'project' && (
        <PickSheet
          title="Проект" items={[...projectNames, 'Без проекта']} value={projectLabel}
          onPick={(v) => setProject(v === 'Без проекта' ? 'none' : String(projects.find((p) => p.name === v)?.id ?? ''))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'category' && (
        <PickSheet
          title="Категория" items={CATEGORIES} value={category}
          onPick={setCategory} onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** Обёртка списка заявок под формой — общий заголовок раздела. */
export function MobileSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', margin: '22px 0 10px' }}>
      {children}
    </div>
  );
}
