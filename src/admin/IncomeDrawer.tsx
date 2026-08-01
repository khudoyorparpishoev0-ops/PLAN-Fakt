import { useMemo, useState, type CSSProperties } from 'react';
import { ACC, PLEX } from '../theme';
import { fmt } from '../lib/format';
import {
  api, ApiError,
  type ApiDictionaries, type ApiProject, type CreateOperationPayload,
} from '../lib/api';
import { useEscapeClose } from '../lib/escape';

export interface IncomeDrawerProps {
  /** Вид операции: доход (in) или расход (out). */
  kind: 'in' | 'out';
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onClose: () => void;
  /** Операция создана (обновить журнал). */
  onCreated: (msg: string) => void;
}

/** Подпись поля формы. */
const lbl: CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };
/** Текстовый инпут формы. */
const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' };
/** Селект формы. */
const sel: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' };
/** Заголовок секции формы. */
const sec: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '0 0 10px' };

const parseAmount = (s: string): number =>
  parseFloat(s.trim().replace(/\s/g, '').replace(',', '.'));

/** Форма «Новый доход / Новый расход» (ШАГ 5): создаёт операцию журнала.
 *  Если фактическая сумма не заполнена — создаётся ПЛАНОВАЯ операция
 *  на плановую сумму (оплата не подтверждена). */
export default function IncomeDrawer(props: IncomeDrawerProps) {
  useEscapeClose(props.onClose);
  const { kind, dicts, projects } = props;
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
  const [currency, setCurrency] = useState('TJS');
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
  const rate = rateStr.trim() !== '' ? parseAmount(rateStr) : undefined;
  const tjsPreview = Number.isFinite(amount) ? (currency === 'TJS' ? amount : rate ? amount * rate : null) : null;
  const valid = article !== '' && Number.isFinite(amount) && amount > 0 && planOk && factOk && !!date && !busy;

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
      ...(rate ? { rate } : {}),
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
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, maxWidth: '94vw', background: '#fff', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: '1px solid #EFEEE9' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{income ? 'Новый доход' : 'Новый расход'}</div>
            <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>
              {isPlan ? 'плановая операция — факт не оплачен' : 'фактическая операция'}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div onClick={props.onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}>
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
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={sel}>
                <option value="TJS">TJS — сомони</option><option>USD</option><option>EUR</option><option>RUB</option><option>CNY</option>
              </select>
            </div>
            <div><div style={lbl}>Курс к сомони</div><input value={rateStr} onChange={e => setRateStr(e.target.value)} placeholder={currency === 'TJS' ? '1,00' : 'из курсов БД'} disabled={currency === 'TJS'} style={{ ...inp, textAlign: 'right', fontFamily: PLEX, ...(currency === 'TJS' ? { background: '#FAF9F6', color: '#8A918D' } : {}) }} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div><div style={lbl}>Фактическая сумма</div><input value={factStr} onChange={e => setFactStr(e.target.value)} placeholder="Заполняется при оплате" style={{ ...inp, background: '#FAF9F6', textAlign: 'right', fontFamily: PLEX }} /></div>
            <div><div style={lbl}>Сумма в сомони</div><input value={tjsPreview != null ? fmt(Math.round(tjsPreview * 100) / 100) : ''} placeholder="считается автоматически" disabled style={{ ...inp, border: '1px solid #EFEDE8', background: '#FAF9F6', textAlign: 'right', color: '#8A918D', fontFamily: PLEX }} /></div>
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
          <div><div style={lbl}>Комментарий</div><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Необязательно" style={{ width: '100%', height: 64, border: '1px solid #DFDCD6', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff', outline: 'none', resize: 'none' }} /></div>
          {error && <div style={{ fontSize: 12, color: '#B93227', marginTop: 10 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #EFEEE9' }}>
          <div onClick={props.onClose} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отмена</div>
          <div
            onClick={valid ? submit : undefined}
            className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </div>
        </div>
      </div>
    </div>
  );
}
