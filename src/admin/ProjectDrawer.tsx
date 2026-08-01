import { useEffect, useState } from 'react';
import type { Project } from '../data/admin';
import { PRJ_GROUPS } from '../data/admin';
import ProjectForm from './ProjectForm';
import { ACC, PLEX, num } from '../theme';
import { fmt, fmtD, pct1 } from '../lib/format';
import { badge } from '../lib/badges';
import { api, type ApiProjectSummary } from '../lib/api';
import { Badge } from '../components/ui';
import { useEscapeClose } from '../lib/escape';

export interface ProjectDrawerProps {
  proj: Project & { archived: boolean };
  onClose: () => void;
  onArchive: () => void;
  /** Карточка проекта изменена — перечитать данные. */
  onSaved: () => void;
  onError: (msg: string) => void;
}

export default function ProjectDrawer({ proj, onClose, onArchive, onSaved }: ProjectDrawerProps) {
  useEscapeClose(onClose);
  const [editing, setEditing] = useState(false);
  /* Сводка по статьям — GET /api/projects/:id/summary (ТЗ, п. 9) */
  const [summary, setSummary] = useState<ApiProjectSummary | null>(null);
  useEffect(() => {
    let alive = true;
    const id = Number(proj.id);
    if (!Number.isFinite(id)) return;
    api.projectSummary(id).then(s => { if (alive) setSummary(s); }).catch(() => {});
    return () => { alive = false; };
  }, [proj.id]);
  const spB = proj.status === 'plan' ? badge('Плановый', 'gray') : proj.status === 'work' ? badge('В работе', 'blue') : badge('Завершён', 'green');
  const spProf = proj.inF - proj.outF;
  const spProfFg = spProf > 0 ? 'var(--fin-plus)' : spProf < 0 ? 'var(--fin-minus)' : 'var(--fin-text-3)';
  const spInF = proj.inF ? fmt(proj.inF) : '—';
  const spOutF = proj.outF ? fmt(proj.outF) : '—';
  const spRentF = proj.inF ? pct1((spProf / proj.inF) * 100) + '%' : '—';
  const spArchLabel = proj.archived ? 'Вернуть из архива' : 'Убрать в архив';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 460, maxWidth: '94vw', background: 'var(--fin-surface)', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 22px', borderBottom: '1px solid var(--fin-divider)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{proj.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>{proj.group} · отв. {proj.resp}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Badge b={spB} style={{ marginTop: 2 }} />
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg></div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '0 0 10px' }}>СВОДКА · ФАКТ И ПЛАН</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div style={{ background: 'var(--fin-surface-alt)', border: '1px solid var(--fin-divider)', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>ДОХОДЫ</div><div style={{ fontSize: 16, fontWeight: 700, ...num }}>{spInF}</div><div style={{ fontSize: 11, color: 'var(--fin-text-4)', fontFamily: PLEX }}>план {fmt(proj.inP)}</div></div>
            <div style={{ background: 'var(--fin-surface-alt)', border: '1px solid var(--fin-divider)', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>РАСХОДЫ</div><div style={{ fontSize: 16, fontWeight: 700, ...num }}>{spOutF}</div><div style={{ fontSize: 11, color: 'var(--fin-text-4)', fontFamily: PLEX }}>план {fmt(proj.outP)}</div></div>
            <div style={{ background: 'var(--fin-surface-alt)', border: '1px solid var(--fin-divider)', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>ПРИБЫЛЬ</div><div style={{ fontSize: 16, fontWeight: 700, color: spProfFg, ...num }}>{fmt(spProf)}</div><div style={{ fontSize: 11, color: 'var(--fin-text-4)', fontFamily: PLEX }}>план {fmt(proj.inP - proj.outP)}</div></div>
            <div style={{ background: 'var(--fin-surface-alt)', border: '1px solid var(--fin-divider)', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>РЕНТАБЕЛЬНОСТЬ</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fin-plus)', ...num }}>{spRentF}</div><div style={{ fontSize: 11, color: 'var(--fin-text-4)' }}>прибыль / доходы</div></div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '0 0 10px' }}>ДЕТАЛИ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed var(--fin-divider)', padding: '5px 0' }}><span style={{ color: 'var(--fin-text-4)' }}>Начало</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{fmtD(proj.s)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed var(--fin-divider)', padding: '5px 0' }}><span style={{ color: 'var(--fin-text-4)' }}>Окончание</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{fmtD(proj.e)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed var(--fin-divider)', padding: '5px 0' }}><span style={{ color: 'var(--fin-text-4)' }}>Группа</span><span style={{ fontWeight: 500 }}>{proj.group}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed var(--fin-divider)', padding: '5px 0' }}><span style={{ color: 'var(--fin-text-4)' }}>Ответственный</span><span style={{ fontWeight: 500 }}>{proj.resp}</span></div>
          </div>
          {summary && summary.rows.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', margin: '0 0 10px' }}>ПЛАН И ФАКТ ПО СТАТЬЯМ</div>
              <div style={{ border: '1px solid var(--fin-divider)', borderRadius: 11, overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ background: 'var(--fin-surface-alt)' }}>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--fin-text-5)' }}>СТАТЬЯ</th>
                    <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: 'var(--fin-text-5)' }}>ПЛАН</th>
                    <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: 'var(--fin-text-5)' }}>ФАКТ</th>
                  </tr></thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.type + r.article}>
                        <td style={{ padding: '6px 12px', borderTop: '1px solid var(--fin-divider)' }}>
                          <span style={{ color: r.type === 'income' ? 'var(--fin-plus)' : 'var(--fin-minus)', marginRight: 6 }}>{r.type === 'income' ? '↑' : '↓'}</span>
                          {r.article}
                        </td>
                        <td style={{ padding: '6px 12px', borderTop: '1px solid var(--fin-divider)', textAlign: 'right', ...num }}>{fmt(r.plan)}</td>
                        <td style={{ padding: '6px 12px', borderTop: '1px solid var(--fin-divider)', textAlign: 'right', fontWeight: 600, ...num }}>{fmt(r.fact)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', lineHeight: 1.55, background: 'var(--fin-surface-alt)', border: '1px solid var(--fin-divider)', borderRadius: 10, padding: '10px 12px' }}>Статусы «Плановый» и «В работе» ставятся автоматически по платежам. «Завершён» отмечается вручную, когда все платежи и обязательства выполнены.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--fin-divider)' }}>
          <div onClick={onArchive} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>{spArchLabel}</div>
          <div
            onClick={() => setEditing(true)}
            className="hv-dim"
            style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Редактировать
          </div>
        </div>
      </div>
      {editing && (
        <ProjectForm
          id={Number(proj.id)}
          initial={{ name: proj.name, group: proj.group, resp: proj.resp, status: proj.status, start: proj.s ?? '', end: proj.e ?? '' }}
          groups={PRJ_GROUPS}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onSaved(); }}
        />
      )}
    </div>
  );
}
