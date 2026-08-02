import { useMemo, useState, type CSSProperties } from 'react';
import type { Expense, Income } from '../data/admin';
import type { Totals } from '../lib/compute';
import { type ApiDictionaries, type ApiProject } from '../lib/api';
import { ROW_PAD, SOFT, num, C, type Density } from '../theme';
import { fmt, sgn, pct1 } from '../lib/format';
import { badge, pfStatus, pfLegend, profDevB, devInfo, type BadgeData, type PfThresholds } from '../lib/badges';
import { Badge, Th } from '../components/ui';
import { savedDensity, saveDensity } from './CompanyTab';
import ArticleOpsDrawer from './ArticleOpsDrawer';
import ExportDialog from './ExportDialog';

/** Отчёт «План-Факт» по макету `IT-HONA План-Факт.dc.html` (README 5.1):
 *  KPI-карточки → предупреждение о статьях без факта → водопад «почему
 *  результат ниже плана» → таблица из двух сворачиваемых групп со строкой
 *  результата → легенда порогов. Статусы вычисляются одной формулой
 *  (pfStatus) из настраиваемых порогов — тех же, что на сервере и в Excel. */

export interface ReportScreenProps {
  incomes: Income[];
  expenses: Expense[];
  totals: Totals;
  /** Пороги статусов — настраиваются в «Настройках», решение заказчика. */
  pf: PfThresholds;
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

const expBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' };

/** Категория отчёта: агрегат строк план-факта по учётной статье. */
interface CatAgg {
  name: string;
  plan: number;
  fact: number;
  pending: boolean; // есть строки, где факт ещё не получен/не оплачен
  resp: string;
  children: { name: string; plan: number; fact: number; pending: boolean }[];
}

/** Категория целиком без факта: ни одна строка не проведена.
 *  Именно такие дают «ложную экономию» (README 5.1). */
const noFact = (c: CatAgg) => c.pending && c.fact === 0;

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

/* ── Водопад ──────────────────────────────────────────────────────────────
 * Считается из тех же категорий, что и таблица: вклад дохода = факт − план,
 * вклад расхода = план − факт, поэтому сумма всех столбцов равна отклонению
 * результата (README 5.1). Мелкие статьи сворачиваются в «Прочие статьи». */

interface WfStep { name: string; v: number; prov: boolean }

function waterfallSteps(incCats: CatAgg[], expCats: CatAgg[]): WfStep[] {
  const contrib: WfStep[] = [
    ...incCats.map(c => ({ name: c.name, v: c.fact - c.plan, prov: noFact(c) })),
    ...expCats.map(c => ({ name: c.name, v: c.plan - c.fact, prov: noFact(c) })),
  ].filter(s => s.v !== 0)
    .map(s => (s.prov ? { ...s, name: s.name + ' — нет факта' } : s));

  // Крупные — отдельными столбцами, хвост — в «Прочие статьи»
  contrib.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const top = contrib.slice(0, 7);
  const restSum = contrib.slice(7).reduce((a, s) => a + s.v, 0);

  // Слева то, что увело результат вниз, справа то, что вернуло (порядок макета)
  const neg = top.filter(s => s.v < 0);
  const pos = top.filter(s => s.v > 0);
  return [...neg, ...pos, ...(restSum !== 0 ? [{ name: 'Прочие статьи', v: restSum, prov: false }] : [])];
}

/** Ось: «круглый» шаг делений под размах данных (1/2/5 × 10^k). */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
}

const thousands = (v: number) => {
  const t = v / 1000;
  return (Math.abs(t) >= 10 || t === 0 ? Math.round(t).toLocaleString('ru-RU') : t.toLocaleString('ru-RU', { maximumFractionDigits: 1 })) + ' тыс.';
};

function Waterfall({ resPlan, resFact, steps }: { resPlan: number; resFact: number; steps: WfStep[] }) {
  const H = 240;
  let cum = resPlan;
  const seq = steps.map(s => { const start = cum; cum += s.v; return { ...s, start, end: cum }; });

  const pts = [resPlan, resFact, ...seq.map(s => s.end)];
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const span = hi - lo || 1;
  const step = niceStep(span / 4);
  // Ось обрезана снизу (README 5.1): начинается не от нуля, а чуть ниже данных
  const axisMin = Math.floor((lo - span * 0.12) / (step / 2)) * (step / 2);
  const axisMax = Math.ceil((hi + span * 0.08) / (step / 2)) * (step / 2);
  const y = (v: number) => ((axisMax - v) / (axisMax - axisMin)) * H;

  const ticks: number[] = [];
  for (let t = Math.ceil(axisMin / step) * step; t <= axisMax; t += step) ticks.push(t);

  interface Bar { name: string; value: string; top: number; h: number; color: string; prov: boolean; pillar: boolean; connY?: number }
  const bars: Bar[] = [];
  const mk = (name: string, value: string, a: number, b: number, color: string, o: { prov?: boolean; pillar?: boolean; connY?: number }) => {
    const top = y(Math.max(a, b));
    bars.push({ name, value, top, h: Math.max(y(Math.min(a, b)) - top, 3), color, prov: !!o.prov, pillar: !!o.pillar, connY: o.connY });
  };
  mk('План года', fmt(resPlan), axisMin, resPlan, 'var(--fin-neutral)', { pillar: true, connY: y(resPlan) });
  seq.forEach((s, i) => mk(s.name, sgn(s.v), s.start, s.end,
    s.prov ? 'var(--fin-warn)' : s.v < 0 ? 'var(--fin-minus)' : 'var(--fin-plus)',
    { prov: s.prov, connY: i < seq.length - 1 || true ? y(s.end) : undefined }));
  mk('Факт года', fmt(resFact), axisMin, resFact, 'var(--fin-accent)', { pillar: true });

  return (
    <div style={{ overflowX: 'auto' }}>
      <div data-waterfall style={{ minWidth: Math.max(bars.length * 96, 560) }}>
        <div style={{ position: 'relative', height: H, margin: '20px 0 8px' }}>
          {ticks.map(t => (
            <div key={t}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: y(t), height: 1, background: 'var(--fin-divider)' }} />
              <div style={{ position: 'absolute', right: 0, top: y(t) - 7, fontSize: 11, color: 'var(--fin-text-5)', ...num }}>{thousands(t)}</div>
            </div>
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {bars.map((b, i) => (
              <div key={i} style={{ position: 'relative', flex: '1 1 0', minWidth: 0 }}>
                <div data-wf-bar={b.prov ? 'prov' : b.pillar ? 'pillar' : 'step'} style={{
                  position: 'absolute', top: b.top, height: b.h, left: '20%', right: '20%', borderRadius: 4,
                  background: b.prov ? 'transparent' : b.color,
                  border: b.prov ? `1.5px dashed ${b.color}` : 'none',
                  opacity: b.pillar ? (b.name === 'План года' ? 0.45 : 1) : 0.92,
                }} />
                <div style={{ position: 'absolute', top: Math.max(b.top - 17, 0), left: -20, right: -20, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12, fontWeight: b.pillar ? 700 : 600, color: b.pillar ? 'var(--fin-text)' : b.color, ...num }}>{b.value}</div>
                {b.connY !== undefined && i < bars.length - 1 && (
                  <div style={{ position: 'absolute', top: b.connY, left: '50%', width: '100%', borderTop: '1px dashed var(--fin-text-5)', opacity: 0.7 }} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {bars.map((b, i) => (
            <div key={i} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', padding: '0 4px', fontSize: 11.5, lineHeight: 1.35, color: b.pillar ? 'var(--fin-text)' : 'var(--fin-text-2)', fontWeight: b.pillar ? 700 : 400 }}>{b.name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Таблица ─────────────────────────────────────────────────────────── */

interface RepRow {
  name: string; planF: string; factF: string; devF: string; devPctF: string; devFg: string;
  b: BadgeData; chev: string; cur: 'default' | 'pointer'; rowBg: string;
  fw: number; fwF: number; nameFg: string; padL: string; resp: string;
  /** Отклонение в % (для мини-полосы в колонке «Откл. %»); null — полосы нет. */
  barPct: number | null; barColor: string;
  countLabel?: string;
  toggle?: () => void;
  detail?: DetailTarget;
}

/** Мини-полоса отклонения: от центра, вправо — плюс, влево — минус, предел ±50%. */
function DevBar({ pct, color }: { pct: number; color: string }) {
  const cap = 50;
  const w = (Math.min(Math.abs(pct), cap) / cap) * 50;
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 56, height: 6, borderRadius: 99, background: 'var(--fin-neutral-soft)', overflow: 'hidden', verticalAlign: 'middle', marginLeft: 8 }}>
      <span style={{ position: 'absolute', top: 0, bottom: 0, left: pct < 0 ? `${50 - w}%` : '50%', width: `${w}%`, background: color, opacity: pct === 0 ? 0 : 0.85, borderRadius: 99 }} />
    </span>
  );
}

export default function ReportScreen(props: ReportScreenProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const { incPlan, incFact, expPlan, expFact, profPlan, profFact } = props.totals;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [groupOpen, setGroupOpen] = useState<Record<'inc' | 'exp', boolean>>({ inc: true, exp: true });
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [density, setDensity] = useState<Density>(savedDensity);
  const th = props.pf;

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

  const incCats = useMemo(() => aggregate(props.incomes), [props.incomes]);
  const expCats = useMemo(() => aggregate(props.expenses), [props.expenses]);

  /* KPI и результат */
  const resDev = profFact - profPlan;
  const kpi = [
    { label: 'Доходы', plan: incPlan, fact: incFact, b: pfStatus(incPlan, incFact, 'income', th), dir: 'inc' as const },
    { label: 'Расходы', plan: expPlan, fact: expFact, b: pfStatus(expPlan, expFact, 'expense', th), dir: 'exp' as const },
    { label: 'Результат', plan: profPlan, fact: profFact, b: profDevB(profPlan, profFact, th), dir: 'inc' as const },
  ];

  /* Обязательное предупреждение (README 5.1): статьи без факта дают ложную
   * экономию — расход не проведён, а отчёт уже показывает «Экономию». */
  const missing = expCats.filter(noFact);
  const missingSum = missing.reduce((a, c) => a + c.plan, 0);

  const wfSteps = useMemo(() => waterfallSteps(incCats, expCats), [incCats, expCats]);

  /* Таблица */
  const rows: RepRow[] = [];
  const push = (o: Partial<RepRow> & Pick<RepRow, 'name' | 'planF' | 'factF' | 'devF' | 'devPctF' | 'devFg' | 'b'>) =>
    rows.push({ chev: '', cur: 'default', rowBg: 'transparent', fw: 500, fwF: 600, nameFg: 'var(--fin-text)', padL: '16px', resp: '', barPct: null, barColor: 'var(--fin-neutral)', toggle: undefined, ...o });

  const devPct = (plan: number, fact: number) => (plan ? ((fact - plan) / Math.abs(plan)) * 100 : null);
  const pctText = (plan: number, fact: number) => {
    const p = devPct(plan, fact);
    return p === null ? '—' : (p > 0 ? '+' : p < 0 ? '−' : '') + pct1(Math.abs(p)) + '%';
  };

  /** Заголовок группы: сводные числа + «N статей · M без факта». */
  const pushGroup = (dir: 'inc' | 'exp', title: string, cats: CatAgg[], plan: number, fact: number) => {
    const open = groupOpen[dir];
    const miss = cats.filter(noFact).length;
    const b = pfStatus(plan, fact, dir === 'inc' ? 'income' : 'expense', th);
    push({
      name: title, planF: fmt(plan), factF: fmt(fact), devF: sgn(fact - plan), devPctF: pctText(plan, fact),
      devFg: 'var(--fin-text)', b, rowBg: 'var(--fin-surface-alt)', fw: 700, fwF: 700,
      countLabel: miss ? `${cats.length} статей · ${miss} без факта` : `${cats.length} статей`,
      barPct: devPct(plan, fact), barColor: b.fg,
      chev: open ? '▾' : '▸',
      toggle: () => setGroupOpen(s => ({ ...s, [dir]: !s[dir] })),
    });
  };

  /** Категория с раскрытием по проектам (если строк больше одной). */
  const pushCat = (type: 'inc' | 'exp', c: CatAgg) => {
    const key = type + '|' + c.name;
    const open = !!expanded[key];
    const many = c.children.length > 1;
    const b = pfStatus(c.plan, noFact(c) ? null : c.fact, type === 'inc' ? 'income' : 'expense', th);
    push({
      name: c.name, planF: fmt(c.plan), factF: noFact(c) ? '—' : fmt(c.fact),
      ...devInfo(type, c.plan, c.fact, c.pending),
      b,
      resp: c.resp,
      barPct: noFact(c) ? null : devPct(c.plan, c.fact),
      barColor: b.fg,
      cur: 'pointer' as const,
      detail: { article: c.name, articleId: articleIds.get(c.name) },
      ...(many ? { chev: open ? '▾' : '▸', toggle: () => setExpanded(st => ({ ...st, [key]: !st[key] })) } : {}),
    });
    if (many && open) {
      for (const ch of c.children) {
        const chNoFact = ch.pending && !ch.fact;
        push({
          name: ch.name,
          planF: fmt(ch.plan),
          factF: chNoFact ? '—' : fmt(ch.fact),
          ...(chNoFact
            ? { devF: '—', devPctF: '—', devFg: 'var(--fin-text-5)', b: badge('Нет данных', 'gray') }
            : { ...devInfo(type, ch.plan, ch.fact), b: pfStatus(ch.plan, ch.fact, type === 'inc' ? 'income' : 'expense', th) }),
          padL: '38px', fw: 400, fwF: 500, nameFg: 'var(--fin-text-2)', rowBg: 'var(--fin-surface-alt)',
          cur: 'pointer' as const,
          detail: { article: c.name, articleId: articleIds.get(c.name), project: ch.name, projectId: projectIds.get(ch.name) },
        });
      }
    }
  };

  pushGroup('inc', 'Доходы', incCats, incPlan, incFact);
  if (groupOpen.inc) for (const c of incCats) pushCat('inc', c);
  pushGroup('exp', 'Расходы', expCats, expPlan, expFact);
  if (groupOpen.exp) for (const c of expCats) pushCat('exp', c);
  // Строка результата — главная цифра экрана (README 5.1), не декоративный итог
  const resB = profDevB(profPlan, profFact, th);
  push({
    name: 'Результат — доходы минус расходы', planF: fmt(profPlan), factF: fmt(profFact),
    devF: sgn(resDev), devPctF: pctText(profPlan, profFact),
    devFg: resDev >= 0 ? 'var(--fin-plus)' : 'var(--fin-minus)',
    b: resB, rowBg: SOFT, fw: 700, fwF: 700,
    barPct: devPct(profPlan, profFact), barColor: resB.fg,
  });

  const card: CSSProperties = { background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: 'var(--card-pad)' };
  const kpiVal: CSSProperties = { fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', ...num };

  return (
    <div data-screen-label="Сводный План-Факт">
      <div data-print-hide style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Подпись проговаривает правило факта — без неё колонка «Факт» непонятна (README 5.1) */}
        <div style={{ fontSize: 13, color: 'var(--fin-text-2)' }}>Сводный отчёт за <b>{props.periodLabel}</b> · все проекты · признание расхода по дате оплаты поставщику</div>
        <div style={{ flex: 1 }} />
        <div data-density-switch style={{ display: 'inline-flex', border: '1px solid var(--fin-border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['Комфортная', 'Компактная'] as Density[]).map(d => (
            <div key={d} data-density-btn={d} onClick={() => { setDensity(d); saveDensity(d); }} style={{ padding: '7px 12px', fontSize: 12, fontWeight: density === d ? 600 : 400, cursor: 'pointer', background: density === d ? SOFT : 'var(--fin-surface)', color: density === d ? 'var(--fin-accent)' : 'var(--fin-text-3)' }}>{d}</div>
          ))}
        </div>
        <div onClick={() => setExportOpen(true)} title="Скачать план-факт.xlsx" className="hv-soft" style={expBtn}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="11" height="11" rx="2" /><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" /></svg>Excel</div>
        <div onClick={() => window.print()} title="Открывает диалог печати — там выберите «Сохранить как PDF»" data-print-pdf className="hv-soft" style={expBtn}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /><path d="M5 8h4M5 10.5h4" /></svg>PDF</div>
        <div onClick={() => window.print()} title="Печать отчёта" data-print-btn className="hv-soft" style={expBtn}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="1.5" width="8" height="4" rx="1" /><rect x="1.5" y="5.5" width="11" height="5" rx="1.5" /><rect x="4" y="9" width="6" height="3.5" rx="1" /></svg>Печать</div>
      </div>

      {/* Шапка печатной версии — на экране не видна */}
      <div style={{ display: 'none', marginBottom: 12 }} data-print-header className="print-only">
        <div style={{ fontSize: 16, fontWeight: 700 }}>IT-HONA LLC · Отчёт «План–Факт»</div>
        <div style={{ fontSize: 12, color: 'var(--fin-text-2)' }}>За {props.periodLabel} · все проекты · суммы в сомони (TJS) · признание расхода по дате оплаты поставщику</div>
      </div>

      {/* KPI: доходы, расходы, результат */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 12 }}>
        {kpi.map(k => {
          const dev = k.fact - k.plan;
          const devFg = dev === 0 ? 'var(--fin-text-3)' : (k.dir === 'inc' ? dev > 0 : dev < 0) ? 'var(--fin-plus)' : 'var(--fin-minus)';
          return (
            <div key={k.label} data-kpi={k.label} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--fin-text-4)' }}>{k.label}</div>
                <Badge b={k.b} />
              </div>
              <div style={kpiVal}>{fmt(k.fact)}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12.5, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--fin-text-3)' }}>план {fmt(k.plan)}</span>
                <span style={{ color: devFg, fontWeight: 600, ...num }}>{sgn(dev)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Обязательное предупреждение: без него отчёт вводит в заблуждение (README 5.1) */}
      {missing.length > 0 && (
        <div data-pf-warning style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--fin-warn-soft)', border: '1px solid var(--fin-warn-soft)', borderRadius: 10, marginBottom: 12, fontSize: 12.5, lineHeight: 1.55, color: 'var(--fin-text)' }}>
          <span style={{ color: 'var(--fin-warn)', fontWeight: 700 }}>!</span>
          <span>
            По {missing.length} {missing.length === 1 ? 'статье' : 'статьям'} расходов факта нет — это <b>{fmt(missingSum)} TJS</b> плана
            ({missing.map(c => c.name.toLowerCase()).join(', ')}). Пока они не проведены, экономия по расходам и результат периода завышены.
          </span>
        </div>
      )}

      {/* Водопад: каждый столбец — вклад статьи в разрыв план→факт результата */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>
          {resDev === 0 ? 'Результат совпал с планом' : `Почему результат ${resDev < 0 ? 'ниже' : 'выше'} плана на ${fmt(Math.abs(resDev))}`}
        </div>
        <div style={{ fontSize: 13, color: 'var(--fin-text-3)', marginTop: 2 }}>
          Каждый столбец — вклад статьи в разрыв. Слева то, что увело результат вниз, справа то, что его вернуло.
        </div>
        <Waterfall resPlan={profPlan} resFact={profFact} steps={wfSteps} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--fin-text-2)' }}>
          {[
            { label: 'Увело вниз', c: 'var(--fin-minus)', dashed: false },
            { label: 'Вернуло вверх', c: 'var(--fin-plus)', dashed: false },
            { label: 'Факт не проведён — не экономия', c: 'var(--fin-warn)', dashed: true },
          ].map(l => (
            <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: l.dashed ? 'transparent' : l.c, border: l.dashed ? `1.5px dashed ${l.c}` : 'none' }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
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
                <tr key={i} onClick={r.detail ? () => setDetail(r.detail!) : r.toggle} className={r.cur === 'pointer' || r.toggle ? 'hv-row' : undefined} style={{ cursor: r.toggle && !r.detail ? 'pointer' : r.cur, background: r.rowBg }}>
                  <td style={{ padding: ROW_PAD, paddingLeft: r.padL, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, fontWeight: r.fw, color: r.nameFg, whiteSpace: 'nowrap' }}>
                    <span
                      onClick={r.toggle ? e => { e.stopPropagation(); r.toggle!(); } : undefined}
                      title={r.toggle ? (r.countLabel ? 'Свернуть/развернуть группу' : 'Показать по проектам') : undefined}
                      style={{ display: 'inline-block', width: 14, color: 'var(--fin-text-5)', fontSize: 10, cursor: r.toggle ? 'pointer' : 'inherit' }}
                    >{r.chev}</span>
                    {r.name}
                    {r.countLabel && <span style={{ marginLeft: 9, fontSize: 11.5, fontWeight: 400, color: 'var(--fin-text-4)' }}>{r.countLabel}</span>}
                  </td>
                  <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: r.fw, ...num, whiteSpace: 'nowrap' }}>{r.planF}</td>
                  <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: r.fwF, ...num, whiteSpace: 'nowrap' }}>{r.factF}</td>
                  <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: 600, color: r.devFg, ...num, whiteSpace: 'nowrap' }}>{r.devF}</td>
                  <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, textAlign: 'right', color: r.devFg, ...num, whiteSpace: 'nowrap' }}>
                    {r.devPctF}
                    {r.barPct !== null && <DevBar pct={r.barPct} color={r.barColor} />}
                  </td>
                  <td style={{ padding: ROW_PAD, borderBottom: '1px solid var(--fin-divider)' }}><Badge b={r.b} /></td>
                  <td style={{ padding: ROW_PAD, paddingRight: 16, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: 'var(--fin-text-2)' }}>{r.resp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Легенда из тех же порогов, что формула, — разойтись не может */}
      <div data-pf-legend style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '13px 16px', marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--fin-text-4)', marginBottom: 9 }}>Как считается статус</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {pfLegend(th).map(l => (
            <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--fin-text-2)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: C[l.color].fg }} />
              <b style={{ color: 'var(--fin-text)' }}>{l.label}</b> {l.rule}
            </span>
          ))}
        </div>
      </div>

      <div data-print-hide style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>Клик по строке — операции статьи за период, «▸» — разбивка по проектам. Отклонение = Факт − План. Пороги статусов настраиваются в «Настройках».</div>

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
