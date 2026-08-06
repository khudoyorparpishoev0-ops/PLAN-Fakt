import { useMemo, useState, type CSSProperties } from 'react';
import { ACC, PLEX } from '../theme';
import { fmt } from '../lib/format';
import {
  api, ApiError,
  type ApiDictionaries, type ApiProject, type CreateOperationPayload,
} from '../lib/api';
import { useEscapeClose } from '../lib/escape';
import { BASE_CURRENCY, rateOf, type CurrencyRow } from '../lib/currency';
import { CurrencySelect } from '../components/ui';

export interface IncomeDrawerProps {
  /** Вид операции: доход (in) или расход (out). */
  kind: 'in' | 'out';
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  /** Справочник валют с курсами (GET /api/currencies). */
  currencies: CurrencyRow[];
  onClose: () => void;
  /** Операция создана (обновить журнал). */
  onCreated: (msg: string) => void;
}

/** Подпись поля формы. */
const lbl: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };
/** Текстовый инпут формы. */
const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
/** Селект формы. */
const sel: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 8px', fontSize: 13, background: 'var(--fin-surface)' };
/** Заголовок секции формы. */
const sec: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '0 0 10px' };

const parseAmount = (s: string): number =>
  parseFloat(s.trim().replace(/\s/g, '').replace(',', '.'));

/** Форма «Новый доход / Новый расход» (ШАГ 5): создаёт операцию журнала.
 *  Если фактическая сумма не заполнена — создаётся ПЛАНОВАЯ операция
 *  на плановую сумму (оплата не подтверждена). */
export default function IncomeDrawer(props: IncomeDrawerProps) {
  useEscapeClose(props.onClose);
  const { kind, dicts, projects, currencies } = props;
  const income = kind === 'in';

  const articles = useMemo(() => {
    const list = dicts ? (income ? dicts.articles.income : dicts.articles.expense) : [];
    return list.flatMap(a => [a.name, ...a.children.map(c => c.name)]);
  }, [dicts, income]);

  const [article, setArticle] = useState('');
  const [project, setProject] = useState('');
  const [party, setParty] = useState('');
  const [docRef, setDocRef] = useState('');
  const [descr, setDescr] = useState('');
  const [planStr, setPlanStr] = useState('');
  const [factStr, setFactStr] = useState('');
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [rateStr, setRateStr] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const planOk = planStr.trim() === '' || parseAmount(planStr) > 0;
  const factOk = factStr.trim() === '' || parseAmount(factStr) > 0;
  const amount = factStr.trim() !== '' ? parseAmount(factStr) : planStr.trim() !== '' ? parseAmount(planStr) : NaN;
  const isPlan = factStr.trim() === '';
  const base = currency === BASE_CURRENCY;
  /** Курс из справочника — подсказка и значение по умолчанию. */
  const knownRate = rateOf(currencies, currency);
  const typedRate = rateStr.trim() !== '' ? parseAmount(rateStr) : undefined;
  const rateValue = base ? 1 : Number.isFinite(typedRate as number) && (typedRate as number) > 0 ? typedRate! : knownRate;
  const tjsPreview = Number.isFinite(amount) && rateValue != null ? amount * rateValue : null;
  const valid = article !== '' && Number.isFinite(amount) && amount > 0 && planOk && factOk && !!date
    && (base || rateValue != null) && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const payload: CreateOperationPayload = {
      date,
      type: kind,
      isPlan,
      amount,
      currency,
      // Курс шлём, только если бухгалтер вписал его руками: иначе сервер
      // возьмёт курс на дату операции, а не сегодняшний из справочника
      ...(typedRate && typedRate > 0 ? { rate: typedRate } : {}),
      articleName: article,
      projectId: project ? Number(project) : undefined,
      accountId: account ? Number(account) : undefined,
      counterpartyName: party.trim() || undefined,
      comment: [descr.trim(), docRef.trim(), comment.trim()].filter(Boolean).join(' · ') || undefined,
    };
    try {
      await api.createOperation(payload);
      props.onCreated(`Операция добавлена${isPlan ? ' (плановая)' : ''}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить операцию');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div onClick={props.onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, maxWidth: '94vw', background: 'var(--fin-surface)', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: '1px solid var(--fin-divider)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{income ? 'Новый доход' : 'Новый расход'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>
              {isPlan ? 'плановая операция — факт не оплачен' : 'фактическая операция'}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div onClick={props.onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={sec}>ОСНОВНОЕ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={lbl}>Категория (статья)</div>
              <select value={article} onChange={e => setArticle(e.target.value)} style={sel}>
                <option value="">Выберите статью</option>
                {articles.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Проект</div>
              <select value={project} onChange={e => setProject(e.target.value)} style={sel}>
                <option value="">Без проекта</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><div style={lbl}>{income ? 'Заказчик' : 'Получатель'}</div><input value={party} onChange={e => setParty(e.target.value)} placeholder={income ? 'Например, ОАО «Обу корез»' : 'Например, «ТаджТехСнаб»'} style={inp} /></div>
            <div><div style={lbl}>Договор / счёт №</div><input value={docRef} onChange={e => setDocRef(e.target.value)} placeholder="Д-24/118 · счёт 214" style={inp} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><div style={lbl}>Описание</div><input value={descr} onChange={e => setDescr(e.target.value)} placeholder={income ? 'За что поступают деньги' : 'За что платим'} style={inp} /></div>
          <div style={sec}>СУММЫ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><div style={lbl}>Плановая сумма</div><input value={planStr} onChange={e => setPlanStr(e.target.value)} placeholder="0" style={{ ...inp, textAlign: 'right', fontFamily: PLEX }} /></div>
            <div>
              <div style={lbl}>Валюта</div>
              <CurrencySelect value={currency} onChange={setCurrency} list={currencies} style={sel} dataAttr="data-op-currency" />
            </div>
            <div>
              <div style={lbl}>Курс к сомони</div>
              <input
                value={rateStr} onChange={e => setRateStr(e.target.value)}
                placeholder={base ? '1,00' : knownRate != null ? fmt(knownRate) : 'курс не задан'}
                disabled={base}
                style={{ ...inp, textAlign: 'right', fontFamily: PLEX, ...(base ? { background: 'var(--fin-surface-alt)', color: 'var(--fin-text-5)' } : {}) }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
            <div><div style={lbl}>Фактическая сумма</div><input value={factStr} onChange={e => setFactStr(e.target.value)} placeholder="Заполняется при оплате" style={{ ...inp, background: 'var(--fin-surface-alt)', textAlign: 'right', fontFamily: PLEX }} /></div>
            <div>
              <div style={lbl}>Сумма в сомони</div>
              <input
                value={tjsPreview != null ? fmt(Math.round(tjsPreview * 100) / 100) : ''}
                placeholder={base ? 'та же сумма' : 'нужен курс'} disabled
                style={{ ...inp, background: 'var(--fin-surface-alt)', textAlign: 'right', color: 'var(--fin-text-4)', fontFamily: PLEX }}
              />
            </div>
          </div>
          {/* Отчёты считаются в сомони, поэтому валютная операция без курса
              не сохранится: лучше сказать это в форме, чем 422 после отправки */}
          <div style={{ fontSize: 12, color: base ? 'var(--fin-text-4)' : rateValue != null ? 'var(--fin-text-4)' : 'var(--fin-minus)', marginBottom: 14 }}>
            {base
              ? 'Суммы в сомони (TJS)'
              : rateValue != null
                ? `В отчёты попадёт сумма в сомони по курсу ${fmt(rateValue)}${knownRate != null && rateStr.trim() === '' ? ' из справочника курсов' : ''}`
                : `Курс ${currency} к сомони не задан — впишите его здесь или в «Настройки → Курсы валют»`}
          </div>
          <div style={sec}>ОПЛАТА</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div><div style={lbl}>Дата операции</div><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, fontFamily: PLEX }} /></div>
            <div>
              <div style={lbl}>{income ? 'Счёт зачисления' : 'Счёт списания'}</div>
              <select value={account} onChange={e => setAccount(e.target.value)} style={sel}>
                <option value="">Не указан</option>
                {(dicts?.accounts ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div><div style={lbl}>Комментарий</div><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Необязательно" style={{ width: '100%', height: 64, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none', resize: 'none' }} /></div>
          {error && <div style={{ fontSize: 12, color: 'var(--fin-minus)', marginTop: 10 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--fin-divider)' }}>
          <div onClick={props.onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отмена</div>
          <div
            onClick={valid ? submit : undefined}
            className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </div>
        </div>
      </div>
    </div>
  );
}
