import { useEffect, useState } from 'react';
import { PLEX, num } from '../theme';
import { fmt, fmtD } from '../lib/format';
import { api, ApiError, type ApiOperation } from '../lib/api';
import { useEscapeClose } from '../lib/escape';

export interface ArticleOpsDrawerProps {
  /** Название статьи (категории отчёта). */
  article: string;
  /** Идентификатор статьи; без него ищем по названию через поиск журнала. */
  articleId?: number;
  /** Проект, если раскрыта строка проекта внутри статьи. */
  project?: string;
  projectId?: number;
  /** Период отчёта. */
  from?: string;
  to?: string;
  periodLabel: string;
  onClose: () => void;
  onError: (msg: string) => void;
}

/** Детализация операций статьи (ТЗ, п. 3.1: клик по строке план-факта). */
export default function ArticleOpsDrawer(p: ArticleOpsDrawerProps) {
  useEscapeClose(p.onClose);
  const [rows, setRows] = useState<ApiOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.operations({
      // По id статьи — точно; если статьи нет в справочнике, ищем по названию
      ...(p.articleId ? { article: p.articleId } : { q: p.article }),
      ...(p.projectId ? { project: p.projectId } : {}),
      dateFrom: p.from,
      dateTo: p.to,
      limit: 100,
    })
      .then(r => { if (alive) { setRows(r.rows); setTotal(r.total); } })
      .catch((e: unknown) => p.onError(e instanceof ApiError ? e.message : 'Не удалось загрузить операции статьи'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.article, p.articleId, p.projectId, p.from, p.to]);

  const sum = rows.reduce((a, o) => a + (o.type === 'in' ? o.amount : -o.amount), 0);

  return (
    <div data-article-ops style={{ position: 'fixed', inset: 0, zIndex: 66 }}>
      <div onClick={p.onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 560, maxWidth: '96vw', background: 'var(--fin-surface-alt)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'var(--fin-surface)', borderBottom: '1px solid var(--fin-border)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{p.article}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>
              Операции за {p.periodLabel}{p.project ? ` · ${p.project}` : ''}
            </div>
          </div>
          <div onClick={p.onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {loading && <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Загрузка…</div>}
          {!loading && rows.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', lineHeight: 1.5 }}>
              За выбранный период операций по этой статье нет — в отчёте только плановая сумма.
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
              {rows.map(o => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--fin-divider)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--fin-text-3)', fontFamily: PLEX, width: 78, flex: 'none' }}>{fmtD(o.date)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.party ?? 'Без контрагента'}
                      {o.isPlan && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--fin-accent)', background: 'var(--fin-accent-soft)', borderRadius: 5, padding: '1px 6px' }}>план</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fin-text-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[o.project, o.comment].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: o.type === 'in' ? 'var(--fin-plus)' : 'var(--fin-minus)', ...num }}>
                    {o.type === 'in' ? '+' : '−'}{fmt(Math.abs(o.amount))}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', fontSize: 12.5, color: 'var(--fin-text-3)' }}>
                <span>Показано {rows.length} из {total}</span>
                <span>Итого: <b style={{ color: 'var(--fin-text)', fontFamily: PLEX }}>{fmt(Math.round(sum))} TJS</b></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
