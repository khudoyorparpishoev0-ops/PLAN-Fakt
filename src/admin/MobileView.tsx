import { useState } from 'react';
import type { Expense, Income } from '../data/admin';
import type { Totals } from '../lib/compute';
import { expRow, incRow, type ExpRow, type IncRow } from '../lib/rows';
import { ACC, C, num } from '../theme';
import { Badge } from '../components/ui';

export interface MobileViewProps {
  goDesktop: () => void;
  totals: Totals;
  incomes: Income[];
  expenses: Expense[];
}

type MTab = 'overview' | 'incomes' | 'expenses' | 'calendar' | 'more';

const mTitles: Record<MTab, string> = { overview: 'Обзор', incomes: 'Доходы', expenses: 'Расходы', calendar: 'Календарь', more: 'Ещё' };

const mList = [
  { dot: C.green.dot, t: 'Ожидаемые поступления', m: '2 счёта до конца месяца', sum: '+310 000', fg: 'var(--fin-plus)' },
  { dot: C.orange.dot, t: 'Предстоящие выплаты', m: 'налоги · подрядчики · ПО', sum: '−142 000', fg: 'var(--fin-text)' },
  { dot: C.red.dot, t: 'Просроченные долги', m: '«Сомон Сервис» · 10 дней', sum: '60 000', fg: 'var(--fin-minus)' },
  { dot: C.yellow.dot, t: 'На согласовании', m: 'заявка Р-2116 · ПО', sum: '12 000', fg: 'var(--fin-text)' },
];

const moreItems = [{ t: 'Платёжный календарь' }, { t: 'Дебиторская задолженность' }, { t: 'Кредиторская задолженность' }, { t: 'Отчёты и экспорт' }, { t: 'История изменений' }];

function OpCard({ r, sub }: { r: IncRow | ExpRow; sub: string }) {
  return (
    <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '13px 14px', marginBottom: 8, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.cat}</div>
        <Badge b={r.b} fs={10.5} pad="2px 8px" dot={5} style={{ flex: 'none' }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginBottom: 9 }}>{r.proj} · {sub}</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
        <div><div style={{ fontSize: 10, color: 'var(--fin-text-5)' }}>План</div><div style={{ fontSize: 13.5, fontWeight: 500, ...num }}>{r.planF}</div></div>
        <div><div style={{ fontSize: 10, color: 'var(--fin-text-5)' }}>Факт</div><div style={{ fontSize: 13.5, fontWeight: 700, ...num }}>{r.factF}</div></div>
        <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: r.devFg, ...num }}>{r.devF}</div>
      </div>
    </div>
  );
}

export default function MobileView(props: MobileViewProps) {
  const [mtab, setMtab] = useState<MTab>('overview');
  const t = props.totals;
  const mFg = (id: MTab) => (mtab === id ? ACC : 'var(--fin-text-4)');
  const incRows = props.incomes.map(incRow);
  const expRows = props.expenses.map(expRow);

  return (
    <div data-screen-label="Мобильная версия" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--fin-border)', padding: 20, gap: 12 }}>
      <div onClick={props.goDesktop} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>‹ Версия для компьютера</div>
      <div style={{ width: 390, height: 'min(780px,calc(100vh - 110px))', background: 'var(--fin-surface-alt)', borderRadius: 34, border: '1px solid var(--fin-border)', boxShadow: '0 24px 60px rgba(25,28,27,.20)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', fontSize: 13, fontWeight: 600 }}><span>9:41</span><span style={{ display: 'flex', gap: 4 }}><span style={{ width: 16, height: 9, border: '1px solid var(--fin-text)', borderRadius: 2.5, opacity: .8 }} /></span></div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 18px 10px' }}>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em' }}>{mTitles[mtab]}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 99, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: 'var(--fin-text-2)' }}>Октябрь 2026 <span style={{ color: 'var(--fin-text-5)' }}>▾</span></div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 16px 20px' }}>

          {mtab === 'overview' && (
            <div>
              <div style={{ background: ACC, borderRadius: 16, padding: '18px 18px 16px', color: 'var(--fin-surface)', marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', opacity: .75 }}>СВОБОДНЫЙ ОСТАТОК</div>
                <div style={{ fontSize: 31, fontWeight: 700, letterSpacing: '-.02em', margin: '4px 0 2px', ...num }}>{t.cashFree} <span style={{ fontSize: 13, fontWeight: 500, opacity: .75 }}>смн</span></div>
                <div style={{ fontSize: 11.5, opacity: .75 }}>касса + банк + ожидаемые − обязательные выплаты</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.18)' }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, opacity: .7 }}>Касса</div><div style={{ fontSize: 13.5, fontWeight: 600, ...num }}>{t.cashBox}</div></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, opacity: .7 }}>Банк</div><div style={{ fontSize: 13.5, fontWeight: 600, ...num }}>{t.cashBank}</div></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, opacity: .7 }}>Всего</div><div style={{ fontSize: 13.5, fontWeight: 600, ...num }}>{t.cashTotal}</div></div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '13px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--fin-text-4)' }}>ДОХОДЫ</span><span style={{ width: 8, height: 8, borderRadius: '50%', background: t.incB.dot }} /></div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, ...num }}>{t.incFactF}</div>
                  <div style={{ fontSize: 11, color: 'var(--fin-text-4)', margin: '1px 0 7px' }}>план {t.incPlanF}</div>
                  <div style={{ height: 4, background: 'var(--fin-divider)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', background: t.incB.dot, width: t.incPctW }} /></div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginTop: 5, color: 'var(--fin-warn)' }}>{t.incPctT} плана · риск</div>
                </div>
                <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '13px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--fin-text-4)' }}>РАСХОДЫ</span><span style={{ width: 8, height: 8, borderRadius: '50%', background: t.expB.dot }} /></div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, ...num }}>{t.expFactF}</div>
                  <div style={{ fontSize: 11, color: 'var(--fin-text-4)', margin: '1px 0 7px' }}>план {t.expPlanF}</div>
                  <div style={{ height: 4, background: 'var(--fin-divider)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', background: t.expB.dot, width: t.expPctW }} /></div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginTop: 5, color: 'var(--fin-plus)' }}>{t.expPctT} бюджета · в норме</div>
                </div>
              </div>
              <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '13px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--fin-text-4)' }}>ПРИБЫЛЬ · ФАКТ</span><div style={{ fontSize: 20, fontWeight: 700, marginTop: 3, ...num }}>{t.profFactF}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--fin-text-4)' }}>план {t.profPlanF}</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fin-minus)', ...num }}>{t.profDevF}</div></div>
                </div>
              </div>
              {mList.map((i, k) => (
                <div key={k} style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '13px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 11, minHeight: 48, cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: i.dot, flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{i.t}</div><div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{i.m}</div></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: i.fg, ...num }}>{i.sum}</div>
                  <span style={{ color: 'var(--fin-border)', fontSize: 16 }}>›</span>
                </div>
              ))}
            </div>
          )}

          {mtab === 'incomes' && (
            <div>
              {incRows.map(r => <OpCard key={r.n} r={r} sub={r.party} />)}
            </div>
          )}

          {mtab === 'expenses' && (
            <div>
              {expRows.map(r => <OpCard key={r.n} r={r} sub={r.payee} />)}
            </div>
          )}

          {mtab === 'calendar' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 30px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--fin-divider)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="var(--fin-text-4)" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg></div>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Платёжный календарь</div>
              <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', marginTop: 4, lineHeight: 1.5 }}>Поступления и выплаты по датам.<br />Появится на этапе 2.</div>
            </div>
          )}

          {mtab === 'more' && (
            <div>
              {moreItems.map((i, k) => (
                <div key={k} style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '0 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, minHeight: 52 }}>
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{i.t}</div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fin-text-4)', background: 'var(--fin-divider)', borderRadius: 99, padding: '2px 8px' }}>Этап 2</span>
                  <span style={{ color: 'var(--fin-border)', fontSize: 16 }}>›</span>
                </div>
              ))}
            </div>
          )}

        </div>
        <div style={{ flex: 'none', height: 62, background: 'var(--fin-surface)', borderTop: '1px solid var(--fin-border)', display: 'flex' }}>
          <div onClick={() => setMtab('overview')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: mFg('overview') }}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" /><rect x="9" y="9" width="5.5" height="5.5" rx="1.5" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Обзор</span>
          </div>
          <div onClick={() => setMtab('incomes')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: mFg('incomes') }}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v9" /><path d="M4.5 8L8 11.5 11.5 8" /><path d="M2.5 14h11" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Доходы</span>
          </div>
          <div onClick={() => setMtab('expenses')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: mFg('expenses') }}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 14V5" /><path d="M4.5 8.5L8 5l3.5 3.5" /><path d="M2.5 2h11" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Расходы</span>
          </div>
          <div onClick={() => setMtab('calendar')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: mFg('calendar') }}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Календарь</span>
          </div>
          <div onClick={() => setMtab('more')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: mFg('more') }}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="3" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="13" cy="8" r="1.2" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Ещё</span>
          </div>
        </div>
      </div>
    </div>
  );
}
