import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import { api, ApiError, type ApiPlanGrid, type ApiPlanGridRow } from '../lib/api';
import { EmptyState, ErrorState, SkeletonTable } from '../components/states';
import { useIsMobile } from '../lib/responsive';

export interface PlanGridProps {
  onChanged: () => void;
}

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/** Ключ ячейки: статья и месяц. */
const key = (articleId: number, month: number) => `${articleId}:${month}`;

const cellBase: CSSProperties = {
  padding: '0 6px', borderBottom: '1px solid var(--fin-divider)',
  borderLeft: '1px solid var(--fin-divider)', textAlign: 'right',
  whiteSpace: 'nowrap', fontSize: 12.5,
};
const headCell: CSSProperties = {
  padding: '9px 6px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em',
  textTransform: 'uppercase', color: 'var(--fin-text-4)', background: 'var(--fin-surface-alt)',
  borderBottom: '1px solid var(--fin-border)', textAlign: 'right',
};
/** Первая колонка липкая: при прокрутке двенадцати месяцев вбок
 *  название статьи должно оставаться на виду. */
const stickyName: CSSProperties = {
  position: 'sticky', left: 0, zIndex: 2, background: 'var(--fin-surface)',
  textAlign: 'left', minWidth: 200,
  boxShadow: '6px 0 8px -6px rgba(0,0,0,.10)',
};

const parseAmount = (s: string): number => {
  const n = Number(String(s).replace(/[^\d.,-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Годовая сетка планов — макет «Планирование».
 *
 *  План на год это двенадцать чисел на статью, и заполняют его один раз,
 *  сидя с калькулятором. Помесячная форма «выбери статью, выбери месяц,
 *  введи сумму» превращает эту работу в сотню отдельных сохранений — поэтому
 *  здесь сетка: идёшь по строке, годовой итог справа, прибыль внизу
 *  пересчитывается сразу.
 *
 *  «Растянуть до декабря» закрывает самый частый случай: аренда, зарплата и
 *  связь одинаковы во все месяцы — вводится одно число вместо двенадцати. */
export default function PlanGrid({ onChanged }: PlanGridProps) {
  const isMobile = useIsMobile();
  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [data, setData] = useState<ApiPlanGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [showFact, setShowFact] = useState(true);
  /** Несохранённые правки: ключ ячейки → сумма. */
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api.planGrid(year, projectId)
      .then((d) => { setData(d); setDraft({}); setFailure(null); })
      .catch((e) => setFailure(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [year, projectId]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const rows = data?.rows ?? [];
  const incomes = rows.filter((r) => r.type === 'income');
  const expenses = rows.filter((r) => r.type === 'expense');

  /** Значение ячейки с учётом несохранённых правок. */
  const planAt = (r: ApiPlanGridRow, m: number) => {
    const k = key(r.articleId, m);
    return k in draft ? draft[k] : r.plan[m];
  };
  const rowTotal = (r: ApiPlanGridRow) => r.plan.reduce((s, _, m) => s + planAt(r, m), 0);
  const colTotal = (list: ApiPlanGridRow[], m: number) => list.reduce((s, r) => s + planAt(r, m), 0);
  const listTotal = (list: ApiPlanGridRow[]) => list.reduce((s, r) => s + rowTotal(r), 0);

  const dirty = Object.keys(draft).length > 0;

  const commit = (articleId: number, month: number, raw: string) => {
    const value = parseAmount(raw);
    const row = rows.find((r) => r.articleId === articleId);
    setDraft((d) => {
      const next = { ...d };
      const k = key(articleId, month);
      if (row && value === row.plan[month]) delete next[k];
      else next[k] = value;
      return next;
    });
    setEditing(null);
  };

  /** Растянуть значение ячейки до декабря — аренда и зарплата одинаковы. */
  const spread = (r: ApiPlanGridRow, from: number) => {
    const value = planAt(r, from);
    setDraft((d) => {
      const next = { ...d };
      for (let m = from; m < 12; m++) {
        const k = key(r.articleId, m);
        if (value === r.plan[m]) delete next[k];
        else next[k] = value;
      }
      return next;
    });
    setEditing(null);
    setFlash(`«${r.article}»: ${fmt(value)} проставлено до декабря`);
  };

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const cells = Object.entries(draft).map(([k, amount]) => {
        const [a, m] = k.split(':').map(Number);
        return { articleId: a, month: m, amount };
      });
      const res = await api.savePlanGrid(year, projectId, cells);
      setFlash(`Сохранено ячеек: ${res.saved}${res.removed ? `, очищено: ${res.removed}` : ''}`);
      load();
      onChanged();
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const incTotal = listTotal(incomes);
  const expTotal = listTotal(expenses);
  const profit = incTotal - expTotal;

  const section = (title: string, list: ApiPlanGridRow[]) => (
    <>
      <tr>
        <td colSpan={14} style={{ padding: '7px 12px', background: 'var(--fin-divider)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--fin-text-3)' }}>{title}</td>
      </tr>
      {list.map((r) => (
        <tr key={r.articleId} className="hv-row">
          <td style={{ ...cellBase, ...stickyName, padding: '0 12px', borderLeft: 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 500, padding: '8px 0' }}>{r.article}</div>
          </td>
          {MONTHS.map((_, m) => {
            const k = key(r.articleId, m);
            const value = planAt(r, m);
            const changed = k in draft;
            const factValue = r.fact[m];
            return (
              <td
                key={m} data-cell={k} style={{ ...cellBase, background: changed ? 'var(--fin-accent-soft)' : undefined }}
                onClick={() => { setEditing(k); setEditValue(value ? String(value) : ''); }}
              >
                {editing === k ? (
                  <input
                    ref={inputRef} value={editValue} inputMode="decimal"
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commit(r.articleId, m, editValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(r.articleId, m, editValue);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    style={{ width: 74, height: 28, border: `1px solid ${ACC}`, borderRadius: 6, padding: '0 6px', textAlign: 'right', ...num, fontSize: 12.5, outline: 'none' }}
                  />
                ) : (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, padding: '6px 0', cursor: 'pointer', minWidth: 66 }}>
                    <span style={{ ...num, fontWeight: value ? 600 : 400, color: value ? 'var(--fin-text)' : 'var(--fin-text-5)' }}>
                      {value ? fmt(value) : '—'}
                    </span>
                    {showFact && (
                      <span style={{ ...num, fontSize: 10.5, color: factValue ? 'var(--fin-text-4)' : 'var(--fin-text-5)' }}>
                        {factValue ? fmt(factValue) : '·'}
                      </span>
                    )}
                  </span>
                )}
              </td>
            );
          })}
          <td style={{ ...cellBase, background: 'var(--fin-surface-alt)', padding: '0 12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...num, fontWeight: 700, fontSize: 13 }}>{fmt(rowTotal(r))}</span>
              <span
                data-spread={r.articleId} title="Проставить значение января до декабря"
                onClick={(e) => { e.stopPropagation(); spread(r, 0); }}
                className="hv-soft"
                style={{ border: '1px solid var(--fin-border)', borderRadius: 6, padding: '3px 7px', fontSize: 11, fontWeight: 600, color: 'var(--fin-text-3)', cursor: 'pointer', background: 'var(--fin-surface)' }}
              >⇥</span>
            </span>
          </td>
        </tr>
      ))}
      <tr>
        <td style={{ ...cellBase, ...stickyName, padding: '9px 12px', borderLeft: 'none', fontWeight: 700, fontSize: 12.5, background: 'var(--fin-surface-alt)' }}>
          Итого {title.toLowerCase()}
        </td>
        {MONTHS.map((_, m) => (
          <td key={m} style={{ ...cellBase, background: 'var(--fin-surface-alt)', padding: '9px 6px', ...num, fontWeight: 700 }}>
            {colTotal(list, m) ? fmt(colTotal(list, m)) : '—'}
          </td>
        ))}
        <td style={{ ...cellBase, background: 'var(--fin-surface-alt)', padding: '9px 12px', ...num, fontWeight: 700 }}>{fmt(listTotal(list))}</td>
      </tr>
    </>
  );

  return (
    <div data-screen-label="Планирование" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: '5px 8px' }}>
          <span onClick={() => setYear((y) => y - 1)} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)' }}>‹</span>
          <span data-plan-year style={{ ...num, fontSize: 13, fontWeight: 700, minWidth: 54, textAlign: 'center' }}>{year}</span>
          <span onClick={() => setYear((y) => y + 1)} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-2)' }}>›</span>
        </div>

        <select
          data-plan-project value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          style={{ height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, padding: '0 10px', fontSize: 12.5, background: 'var(--fin-surface)' }}
        >
          <option value="">Все проекты</option>
          {(data?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fin-text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showFact} onChange={(e) => setShowFact(e.target.checked)} data-plan-fact />
          Показывать факт
        </label>

        <div style={{ flex: 1 }} />

        {dirty && (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fin-warn)' }}>
              Есть несохранённые правки: {Object.keys(draft).length}
            </span>
            <button
              type="button" onClick={() => setDraft({})}
              style={{ height: 'var(--fin-ctrl-h)', padding: '0 14px', borderRadius: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >Отменить</button>
            <button
              type="button" data-plan-save onClick={save} disabled={busy}
              style={{ height: 'var(--fin-ctrl-h)', padding: '0 16px', borderRadius: 8, border: 'none', background: ACC, color: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
            >{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          </>
        )}
      </div>

      {flash && (
        <div style={{ background: 'var(--fin-plus-soft)', color: 'var(--fin-plus)', borderRadius: 10, padding: '9px 13px', fontSize: 12.5 }}>{flash}</div>
      )}
      {failure && (
        <ErrorState
          title="Сетка планов не загрузилась"
          reassure="Введённые правки остались на экране — сохраните их после повтора."
          detail={failure}
          onRetry={() => { setFailure(null); load(); }}
        />
      )}

      {loading && rows.length === 0 && !failure ? <SkeletonTable rows={8} cols={7} /> : rows.length === 0 ? (
        <EmptyState
          title="Плана на этот год ещё нет"
          text="Сетка наполнится, как только появятся операции по статьям или вы введёте первые суммы вручную на соседнем годе."
          action={year !== thisYear ? `Перейти в ${thisYear}` : undefined}
          onAction={year !== thisYear ? () => setYear(thisYear) : undefined}
        />
      ) : (
        <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table data-plan-grid style={{ borderCollapse: 'collapse', minWidth: isMobile ? 900 : '100%', width: '100%' }}>
              <thead><tr>
                <th style={{ ...headCell, ...stickyName, background: 'var(--fin-surface-alt)', padding: '9px 12px' }}>Статья</th>
                {MONTHS.map((m) => <th key={m} style={headCell}>{m}</th>)}
                <th style={{ ...headCell, padding: '9px 12px' }}>Год</th>
              </tr></thead>
              <tbody>
                {incomes.length > 0 && section('ДОХОДЫ', incomes)}
                {expenses.length > 0 && section('РАСХОДЫ', expenses)}
                <tr>
                  <td style={{ ...cellBase, ...stickyName, padding: '11px 12px', borderLeft: 'none', fontWeight: 700, fontSize: 13, background: 'var(--fin-surface)' }}>Прибыль</td>
                  {MONTHS.map((_, m) => {
                    const v = colTotal(incomes, m) - colTotal(expenses, m);
                    return (
                      <td key={m} style={{ ...cellBase, padding: '11px 6px', ...num, fontWeight: 700, color: v < 0 ? 'var(--fin-minus)' : v > 0 ? 'var(--fin-plus)' : 'var(--fin-text-3)' }}>
                        {v ? fmt(v) : '—'}
                      </td>
                    );
                  })}
                  <td data-plan-profit style={{ ...cellBase, padding: '11px 12px', ...num, fontWeight: 700, fontSize: 13, color: profit < 0 ? 'var(--fin-minus)' : 'var(--fin-plus)' }}>{fmt(profit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--fin-text-4)', lineHeight: 1.6 }}>
        Нажмите на ячейку и введите сумму — итоги строки, месяца и прибыль пересчитаются сразу.
        Кнопка <b>⇥</b> в колонке «Год» проставляет январское значение до декабря: аренда, зарплата
        и связь одинаковы во все месяцы. Мелкая цифра под планом — факт по этой статье за месяц.
        Пустая ячейка означает, что плана нет; ноль сотрёт ранее введённый план.
      </div>
    </div>
  );
}
