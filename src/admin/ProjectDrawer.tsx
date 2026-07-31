import { useEffect, useState } from 'react';
import type { Project } from '../data/admin';
import { PRJ_GROUPS } from '../data/admin';
import ProjectForm from './ProjectForm';
import { ACC, PLEX, num } from '../theme';
import { fmt, fmtD, pct1 } from '../lib/format';
import { badge } from '../lib/badges';
import { api, type ApiProjectSummary } from '../lib/api';
import { Badge } from '../components/ui';

export interface ProjectDrawerProps {
  proj: Project & { archived: boolean };
  onClose: () => void;
  onArchive: () => void;
  /** Карточка проекта изменена — перечитать данные. */
  onSaved: () => void;
  onError: (msg: string) => void;
}

export default function ProjectDrawer({ proj, onClose, onArchive, onSaved }: ProjectDrawerProps) {
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
  const spB = proj.status === 'plan' ? badge('Плановый', 'blue') : proj.status === 'work' ? badge('В работе', 'yellow') : badge('Завершён', 'green');
  const spProf = proj.inF - proj.outF;
  const spProfFg = spProf > 0 ? '#1A7A4B' : spProf < 0 ? '#B93227' : '#6B7370';
  const spInF = proj.inF ? fmt(proj.inF) : '—';
  const spOutF = proj.outF ? fmt(proj.outF) : '—';
  const spRentF = proj.inF ? pct1((spProf / proj.inF) * 100) + '%' : '—';
  const spArchLabel = proj.archived ? 'Вернуть из архива' : 'Убрать в архив';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 460, maxWidth: '94vw', background: '#fff', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 22px', borderBottom: '1px solid #EFEEE9' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{proj.name}</div>
            <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>{proj.group} · отв. {proj.resp}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Badge b={spB} style={{ marginTop: 2 }} />
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg></div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '0 0 10px' }}>СВОДКА · ФАКТ И ПЛАН</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div style={{ background: '#FAF9F6', border: '1px solid #EFEDE8', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: '#A6ACA8', fontWeight: 600 }}>ДОХОДЫ</div><div style={{ fontSize: 16, fontWeight: 700, ...num }}>{spInF}</div><div style={{ fontSize: 11, color: '#8A918D', fontFamily: PLEX }}>план {fmt(proj.inP)}</div></div>
            <div style={{ background: '#FAF9F6', border: '1px solid #EFEDE8', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: '#A6ACA8', fontWeight: 600 }}>РАСХОДЫ</div><div style={{ fontSize: 16, fontWeight: 700, ...num }}>{spOutF}</div><div style={{ fontSize: 11, color: '#8A918D', fontFamily: PLEX }}>план {fmt(proj.outP)}</div></div>
            <div style={{ background: '#FAF9F6', border: '1px solid #EFEDE8', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: '#A6ACA8', fontWeight: 600 }}>ПРИБЫЛЬ</div><div style={{ fontSize: 16, fontWeight: 700, color: spProfFg, ...num }}>{fmt(spProf)}</div><div style={{ fontSize: 11, color: '#8A918D', fontFamily: PLEX }}>план {fmt(proj.inP - proj.outP)}</div></div>
            <div style={{ background: '#FAF9F6', border: '1px solid #EFEDE8', borderRadius: 11, padding: '11px 13px' }}><div style={{ fontSize: 10.5, color: '#A6ACA8', fontWeight: 600 }}>РЕНТАБЕЛЬНОСТЬ</div><div style={{ fontSize: 16, fontWeight: 700, color: '#1A7A4B', ...num }}>{spRentF}</div><div style={{ fontSize: 11, color: '#8A918D' }}>прибыль / доходы</div></div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '0 0 10px' }}>ДЕТАЛИ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #EFEDE8', padding: '5px 0' }}><span style={{ color: '#8A918D' }}>Начало</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{fmtD(proj.s)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #EFEDE8', padding: '5px 0' }}><span style={{ color: '#8A918D' }}>Окончание</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{fmtD(proj.e)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #EFEDE8', padding: '5px 0' }}><span style={{ color: '#8A918D' }}>Группа</span><span style={{ fontWeight: 500 }}>{proj.group}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #EFEDE8', padding: '5px 0' }}><span style={{ color: '#8A918D' }}>Ответственный</span><span style={{ fontWeight: 500 }}>{proj.resp}</span></div>
          </div>
          {summary && summary.rows.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '0 0 10px' }}>ПЛАН И ФАКТ ПО СТАТЬЯМ</div>
              <div style={{ border: '1px solid #EFEDE8', borderRadius: 11, overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ background: '#FAF9F6' }}>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#A6ACA8' }}>СТАТЬЯ</th>
                    <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#A6ACA8' }}>ПЛАН</th>
                    <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#A6ACA8' }}>ФАКТ</th>
                  </tr></thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.type + r.article}>
                        <td style={{ padding: '6px 12px', borderTop: '1px solid #F3F2ED' }}>
                          <span style={{ color: r.type === 'income' ? '#1A7A4B' : '#B93227', marginRight: 6 }}>{r.type === 'income' ? '↑' : '↓'}</span>
                          {r.article}
                        </td>
                        <td style={{ padding: '6px 12px', borderTop: '1px solid #F3F2ED', textAlign: 'right', ...num }}>{fmt(r.plan)}</td>
                        <td style={{ padding: '6px 12px', borderTop: '1px solid #F3F2ED', textAlign: 'right', fontWeight: 600, ...num }}>{fmt(r.fact)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div style={{ fontSize: 11.5, color: '#8A918D', lineHeight: 1.55, background: '#FAF9F6', border: '1px solid #EFEDE8', borderRadius: 10, padding: '10px 12px' }}>Статусы «Плановый» и «В работе» ставятся автоматически по платежам. «Завершён» отмечается вручную, когда все платежи и обязательства выполнены.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #EFEEE9' }}>
          <div onClick={onArchive} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>{spArchLabel}</div>
          <div
            onClick={() => setEditing(true)}
            className="hv-dim"
            style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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
