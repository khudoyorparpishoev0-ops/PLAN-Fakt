import { useMemo, useState, type CSSProperties } from 'react';
import type { Expense, Income } from '../data/admin';
import type { Totals } from '../lib/compute';
import { api, type ApiDictionaries, type ApiProject } from '../lib/api';
import { ROW_PAD, SOFT, num } from '../theme';
import { fmt, sgn, pct1 } from '../lib/format';
import { badge, incDevB, expDevB, profDevB, devInfo, type BadgeData } from '../lib/badges';
import { Badge, Th } from '../components/ui';
import ArticleOpsDrawer from './ArticleOpsDrawer';
import ExportDialog from './ExportDialog';

export interface ReportScreenProps {
  incomes: Income[];
  expenses: Expense[];
  totals: Totals;
  /** Подпись выбранного периода («Октябрь 2026», «2026 год», …). */
  periodLabel: string;
  /** Границы периода — для детализации операций статьи. */
  from?: string;
  to?: string;
  /** Справочники и проекты: по названию находим id для фильтра журнала. */
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onError: (msg: string) => void;
}

/** Строка, по которой открывается детализация операций (ТЗ, п. 3.1). */
interface DetailTarget { article: string; articleId?: number; project?: string; projectId?: number }

interface RepRow {
  name: string; planF: string; factF: string; devF: string; devPctF: string; devFg: string;
  b: BadgeData; chev: string; cur: 'default' | 'pointer'; rowBg: string;
  fw: number; fwF: number; nameFg: string; padL: string; resp: string;
  toggle?: () => void;
  /** Клик по строке — детализация операций статьи. */
  detail?: DetailTarget;
}

const expBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' };

/** Категория отчёта: агрегат строк план-факта по учётной статье. */
interface CatAgg {
  name: string;
  plan: number;
  fact: number;
  pending: boolean; // факт ещё не получен/не оплачен
  resp: string;
  children: { name: string; plan: number; fact: number; pending: boolean }[];
}

/** Группировка строк план-факта по категории (статье). Подстроки — по проектам. */
function aggregate(rows: { cat: string; proj: string; plan: number; fact: number; resp: string; pending?: boolean }[]): CatAgg[] {
  const byCat = new Map<string, CatAgg & { maxPlan: number }>();
  for (const r of rows) {
    let agg = byCat.get(r.cat);
    if (!agg) {
      agg = { name: r.cat, plan: 0, fact: 0, pending: false, resp: r.resp, children: [], maxPlan: -1 };
      byCat.set(r.cat, agg);
    }
    agg.plan += r.plan;
    agg.fact += r.fact;
    agg.pending = agg.pending || (!!r.pending && !r.fact);
    if (r.plan > agg.maxPlan) { agg.maxPlan = r.plan; agg.resp = r.resp; }
    agg.children.push({ name: r.proj, plan: r.plan, fact: r.fact, pending: !!r.pending && !r.fact });
  }
  return [...byCat.values()];
}

export default function ReportScreen(props: ReportScreenProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const { incPlan, incFact, expPlan, expFact, profPlan, profFact } = props.totals;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  /** Название статьи → id (вместе с подстатьями) для фильтра журнала. */
  const articleIds = useMemo(() => {
    const map = new Map<string, number>();
    const all = props.dicts ? [...props.dicts.articles.income, ...props.dicts.articles.expense] : [];
    for (const a of all) {
      map.set(a.name, a.id);
      for (const ch of a.children) map.set(ch.name, ch.id);
    }
    return map;
  }, [props.dicts]);
  const projectIds = useMemo(
    () => new Map(props.projects.map(p => [p.name, p.id])),
    [props.projects],
  );

  const rows: RepRow[] = [];
  const push = (o: Partial<RepRow> & Pick<RepRow, 'name' | 'planF' | 'factF' | 'devF' | 'devPctF' | 'devFg' | 'b'>) =>
    rows.push({ chev: '', cur: 'default', rowBg: 'transparent', fw: 500, fwF: 600, nameFg: 'var(--fin-text)', padL: '16px', resp: '', toggle: undefined, ...o });
  const grp = (name: string, plan: number, fact: number, b: BadgeData) => push({ name, planF: fmt(plan), factF: fmt(fact), devF: sgn(fact - plan), devPctF: plan > 0 ? (fact - plan > 0 ? '+' : '−') + pct1(Math.abs((fact - plan) / plan * 100)) + '%' : '—', devFg: 'var(--fin-text)', b, rowBg: 'var(--fin-divider)', fw: 700, fwF: 700 });

  /** Категория с раскрытием по проектам (если строк больше одной). */
  const pushCat = (type: 'inc' | 'exp', c: CatAgg) => {
    const key = type + '|' + c.name;
    const open = !!expanded[key];
    const many = c.children.length > 1;
    push({
      name: c.name, planF: fmt(c.plan), factF: c.pending && !c.fact ? '—' : fmt(c.fact),
      ...devInfo(type, c.plan, c.fact, c.pending),
      b: type === 'inc' ? incDevB(c.plan, c.fact, c.pending) : expDevB(c.plan, c.fact, c.pending),
      resp: c.resp,
      cur: 'pointer' as const,
      detail: { article: c.name, articleId: articleIds.get(c.name) },
      ...(many ? { chev: open ? '▾' : '▸', toggle: () => setExpanded(st => ({ ...st, [key]: !st[key] })) } : {}),
    });
    if (many && open) {
      for (const ch of c.children) {
        push({
          name: ch.name,
          planF: fmt(ch.plan),
          factF: ch.pending && !ch.fact ? '—' : fmt(ch.fact),
          ...(ch.pending && !ch.fact
            ? { devF: '—', devPctF: '—', devFg: 'var(--fin-text-5)', b: badge('Ожидается', 'gray') }
            : { ...devInfo(type, ch.plan, ch.fact), b: type === 'inc' ? incDevB(ch.plan, ch.fact) : expDevB(ch.plan, ch.fact) }),
          padL: '38px', fw: 400, fwF: 500, nameFg: 'var(--fin-text-2)', rowBg: 'var(--fin-surface-alt)',
          cur: 'pointer' as const,
          detail: { article: c.name, articleId: articleIds.get(c.name), project: ch.name, projectId: projectIds.get(ch.name) },
        });
      }
    }
  };

  grp('Доходы — всего', incPlan, incFact, incDevB(incPlan, incFact));
  for (const c of aggregate(props.incomes)) pushCat('inc', c);
  grp('Расходы — всего', expPlan, expFact, expDevB(expPlan, expFact));
  for (const c of aggregate(props.expenses)) pushCat('exp', c);
  push({ name: 'ПРИБЫЛЬ', planF: fmt(profPlan), factF: fmt(profFact), devF: sgn(profFact - profPlan), devPctF: profPlan > 0 ? (profFact - profPlan >= 0 ? '+' : '−') + pct1(Math.abs((profFact - profPlan) / profPlan * 100)) + '%' : '—', devFg: profFact - profPlan >= 0 ? 'var(--fin-plus)' : 'var(--fin-minus)', b: profDevB(profPlan, profFact), rowBg: SOFT, fw: 700, fwF: 700 });

  return (
    <div data-screen-label="Сводный План-Факт">
      <div data-print-hide style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--fin-text-2)' }}>Сводный отчёт за <b>{props.periodLabel}</b> · все проекты · в сомони</div>
        <div style={{ flex: 1 }} />
        <div onClick={() => setExportOpen(true)} title="Скачать план-факт.xlsx" className="hv-soft" style={expBtn}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="11" height="11" rx="2" /><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" /></svg>Excel</div>
        <div onClick={() => window.print()} title="Открывает диалог печати — там выберите «Сохранить как PDF»" data-print-pdf className="hv-soft" style={expBtn}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /><path d="M5 8h4M5 10.5h4" /></svg>PDF</div>
        <div onClick={() => window.print()} title="Печать отчёта" data-print-btn className="hv-soft" style={expBtn}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="1.5" width="8" height="4" rx="1" /><rect x="1.5" y="5.5" width="11" height="5" rx="1.5" /><rect x="4" y="9" width="6" height="3.5" rx="1" /></svg>Печать</div>
      </div>

      {/* Шапка печатной версии — на экране не видна */}
      <div style={{ display: 'none', marginBottom: 12 }} data-print-header className="print-only">
        <div style={{ fontSize: 16, fontWeight: 700 }}>IT-HONA LLC · Отчёт «План–Факт»</div>
        <div style={{ fontSize: 12, color: 'var(--fin-text-2)' }}>За {props.periodLabel} · все проекты · суммы в сомони (TJS)</div>
      </div>
      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th style={{ padding: '8px 12px 8px 16px' }}>Категория</Th>
            <Th right>План</Th>
            <Th right>Факт</Th>
            <Th right>Отклонение</Th>
            <Th right>Откл. %</Th>
            <Th>Статус</Th>
            <Th style={{ padding: '8px 16px 8px 12px' }}>Ответственный</Th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onClick={r.detail ? () => setDetail(r.detail!) : r.toggle} className={r.cur === 'pointer' ? 'hv-row' : undefined} style={{ cursor: r.cur, background: r.rowBg }}>
                <td style={{ padding: ROW_PAD, paddingLeft: r.padL, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, fontWeight: r.fw, color: r.nameFg }}>
                  <span
                    onClick={r.toggle ? e => { e.stopPropagation(); r.toggle!(); } : undefined}
                    title={r.toggle ? 'Показать по проектам' : undefined}
                    style={{ display: 'inline-block', width: 14, color: 'var(--fin-text-5)', fontSize: 10, cursor: r.toggle ? 'pointer' : 'inherit' }}
                  >{r.chev}</span>
                  {r.name}
                </td>
                <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: r.fw, ...num, whiteSpace: 'nowrap' }}>{r.planF}</td>
                <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: r.fwF, ...num, whiteSpace: 'nowrap' }}>{r.factF}</td>
                <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: 600, color: r.devFg, ...num, whiteSpace: 'nowrap' }}>{r.devF}</td>
                <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, textAlign: 'right', color: r.devFg, ...num, whiteSpace: 'nowrap' }}>{r.devPctF}</td>
                <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)' }}><Badge b={r.b} /></td>
                <td style={{ padding: ROW_PAD, paddingRight: 16, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: 'var(--fin-text-2)' }}>{r.resp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-print-hide style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>Клик по строке — операции статьи за период, «▸» — разбивка по проектам. Отклонение = Факт − План. Для доходов минус — недополучено. Для расходов плюс — перерасход, минус — экономия. Если план не указан — статус «Нет данных», деление на ноль не выполняется.</div>

      {detail && (
        <ArticleOpsDrawer
          article={detail.article}
          articleId={detail.articleId}
          project={detail.project}
          projectId={detail.projectId}
          from={props.from}
          to={props.to}
          periodLabel={props.periodLabel}
          onClose={() => setDetail(null)}
          onError={props.onError}
        />
      )}

      {exportOpen && <ExportDialog kind="report" onClose={() => setExportOpen(false)} />}
    </div>
  );
}
