import { useEffect, useState, type CSSProperties } from 'react';
import { ACC, ROW_PAD, PLEX, num } from '../theme';
import { fmt, sgn } from '../lib/format';
import { api, ApiError, type ApiPlans, type ApiPlanRow } from '../lib/api';
import { AccentBtn, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import { useEscapeClose } from '../lib/escape';
import PlanGrid from './PlanGrid';

export interface PlanningScreenProps {
  onError: (msg: string) => void;
  /** Планы изменились — перечитать план-факт панели. */
  onChanged: () => void;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
/** Сдвиг месяца: '2026-10-01' + n месяцев → '2026-11'. */
const shiftMonth = (period: string, n: number) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** Форма плановой суммы: статья + проект + сумма на выбранный месяц. */
function PlanModal({ data, initial, onClose, onSubmit }: {
  data: ApiPlans;
  initial?: ApiPlanRow;
  onClose: () => void;
  onSubmit: (payload: { articleId: number; projectId?: number; amount: number }) => Promise<void>;
}) {
  useEscapeClose(onClose);
  const [articleId, setArticleId] = useState(String(initial?.articleId ?? data.articles[0]?.id ?? ''));
  const [projectId, setProjectId] = useState(String(initial?.projectId ?? ''));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = parseFloat(amount.trim().replace(/\s/g, '').replace(',', '.'));
  const valid = articleId !== '' && Number.isFinite(value) && value >= 0 && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ articleId: Number(articleId), ...(projectId ? { projectId: Number(projectId) } : {}), amount: value });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить план');
      setBusy(false);
    }
  };

  return (
    <div data-plan-modal style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '94vw', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{initial ? 'Изменить план' : 'Новая плановая сумма'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', marginBottom: 16 }}>Период: {monthLabel(data.period)}</div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Статья</div>
          <select value={articleId} onChange={e => setArticleId(e.target.value)} disabled={!!initial} style={{ ...inp, padding: '0 8px', ...(initial ? { background: 'var(--fin-surface-alt)', color: 'var(--fin-text-4)' } : {}) }}>
            {data.articles.map(a => (
              <option key={a.id} value={a.id}>{a.type === 'income' ? '↑ ' : '↓ '}{a.name}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Проект</div>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!!initial} style={{ ...inp, padding: '0 8px', ...(initial ? { background: 'var(--fin-surface-alt)', color: 'var(--fin-text-4)' } : {}) }}>
            <option value="">Без проекта</option>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={lbl}>Плановая сумма, TJS</div>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus
            style={{ ...inp, textAlign: 'right', fontFamily: PLEX }} />
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--fin-minus)', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отмена</div>
          <div onClick={valid ? submit : undefined} className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Модуль «Планирование» (этап 2): плановые суммы по статьям и проектам на
 *  месяц — та самая база сравнения для отчёта «План–Факт» (ТЗ, п. 7). */
export default function PlanningScreen({ onError, onChanged }: PlanningScreenProps) {
  const isMobile = useIsMobile();
  /* Год по умолчанию: план заполняют сразу на двенадцать месяцев. Помесячный
     список оставлен для точечной правки одной строки — там видно проект,
     которого в сводной сетке нет. */
  const [mode, setMode] = useState<'year' | 'month'>('year');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<ApiPlans | null>(null);
  const [modal, setModal] = useState<{ row?: ApiPlanRow } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.plans(period)
      .then(setData)
      .catch((e: unknown) => onError(e instanceof ApiError ? e.message : 'Не удалось загрузить планы'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [period]);

  const remove = async (row: ApiPlanRow) => {
    if (!window.confirm(`Удалить план «${row.article}» (${row.project})?`)) return;
    try {
      await api.removePlan(row.id);
      load();
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось удалить план');
    }
  };

  const rows = data?.rows ?? [];
  const incomes = rows.filter(r => r.type === 'income');
  const expenses = rows.filter(r => r.type === 'expense');
  const sum = (list: ApiPlanRow[], f: (r: ApiPlanRow) => number) => list.reduce((s, r) => s + f(r), 0);

  const section = (title: string, list: ApiPlanRow[]) => (
    <>
      <tr>
        <td colSpan={5} style={{ padding: '8px 16px', background: 'var(--fin-divider)', fontSize: 12.5, fontWeight: 700 }}>
          {title} · план {fmt(sum(list, r => r.amount))} · факт {fmt(sum(list, r => r.fact))}
        </td>
      </tr>
      {list.map(r => {
        const dev = r.fact - r.amount;
        return (
          <tr key={r.id} className="hv-row">
            <td style={{ padding: ROW_PAD, paddingLeft: 16, borderBottom: '1px solid var(--fin-divider)', fontSize: 13 }}>{r.article}</td>
            <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: 'var(--fin-text-2)' }}>{r.project}</td>
            <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(r.amount)}</td>
            <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', ...num, whiteSpace: 'nowrap' }}>{r.fact ? fmt(r.fact) : '—'}</td>
            <td style={{ padding: ROW_PAD, paddingRight: 16, borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 12.5, marginRight: 10, color: dev === 0 ? 'var(--fin-text-3)' : (r.type === 'income' ? dev > 0 : dev < 0) ? 'var(--fin-plus)' : 'var(--fin-minus)', ...num }}>
                {r.fact ? sgn(dev) : ''}
              </span>
              <span onClick={() => setModal({ row: r })} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer', marginRight: 6 }}>Изменить</span>
              <span onClick={() => void remove(r)} className="hv-red" style={{ border: '1px solid var(--fin-minus-soft)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--fin-minus)', cursor: 'pointer' }}>Удалить</span>
            </td>
          </tr>
        );
      })}
    </>
  );

  const modeSwitch = (
    <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2 }}>
      {([['year', 'Год'], ['month', 'Месяц']] as const).map(([id, label]) => {
        const on = mode === id;
        return (
          <button
            key={id} type="button" data-plan-mode={id} onClick={() => setMode(id)}
            style={{
              padding: '6px 14px', border: 'none', cursor: 'pointer', borderRadius: 7,
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 600 : 500,
              background: on ? 'var(--fin-surface)' : 'transparent',
              color: on ? 'var(--fin-text)' : 'var(--fin-text-3)',
              boxShadow: on ? 'var(--fin-shadow-seg)' : 'none',
            }}
          >{label}</button>
        );
      })}
    </div>
  );

  if (mode === 'year') {
    return (
      <div data-screen-label="Планирование" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>{modeSwitch}</div>
        <PlanGrid onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div data-screen-label="Планирование">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {modeSwitch}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: '5px 8px' }}>
          <span onClick={() => setPeriod(shiftMonth(period + '-01', -1))} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)' }}>‹</span>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{monthLabel(period + '-01')}</span>
          <span onClick={() => setPeriod(shiftMonth(period + '-01', 1))} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)' }}>›</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>{isMobile ? 'План месяца' : 'Плановые суммы месяца — база сравнения для отчёта «План–Факт»'}</div>
        <div style={{ flex: 1 }} />
        {data && (
          <AccentBtn style={{ padding: '8px 15px' }} onClick={() => setModal({})}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> План
          </AccentBtn>
        )}
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '8px 12px 8px 16px' }}>Статья</Th>
              <Th>Проект</Th>
              <Th right>План</Th>
              <Th right>Факт</Th>
              <Th right style={{ padding: '8px 16px 8px 12px' }}>Отклонение · действия</Th>
            </tr></thead>
            <tbody>
              {incomes.length > 0 && section('ДОХОДЫ', incomes)}
              {expenses.length > 0 && section('РАСХОДЫ', expenses)}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-5)' }}>
                  {loading ? 'Загрузка…' : 'На этот месяц планов нет — добавьте первую строку'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>
        План задаётся на месяц по паре «статья + проект». Факт подтягивается из операций
        того же месяца, отклонение считается как факт − план.
      </div>

      {modal && data && (
        <PlanModal
          data={data}
          initial={modal.row}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            await api.savePlan({ period: `${period}-01`, ...payload });
            setModal(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
