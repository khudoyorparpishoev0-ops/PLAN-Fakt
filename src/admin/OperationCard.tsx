import { useEffect, useState } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt, fmtD } from '../lib/format';
import { badge } from '../lib/badges';
import { api, ApiError, type ApiOperationCard, type ApiProject } from '../lib/api';
import { Badge } from '../components/ui';

export interface OperationCardProps {
  id: number;
  projects: ApiProject[];
  onClose: () => void;
  /** Операция изменена или удалена — перечитать журнал и панель. */
  onChanged: () => void;
  onError: (msg: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  in: 'Поступление', out: 'Выплата', move: 'Перемещение', accrual: 'Начисление',
};

/** Расшифровка действий аудита в карточке. */
const ACTION_LABEL: Record<string, string> = {
  create: 'Создана',
  bulk_confirm: 'Оплата подтверждена',
  bulk_delete: 'Удалена',
  bulk_project: 'Перенесена в другой проект',
};

const row = (label: string, value: React.ReactNode) => (
  <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>
    <span style={{ color: '#8A918D', width: 118, flex: 'none' }}>{label}</span>
    <span style={{ minWidth: 0, flex: 1 }}>{value}</span>
  </div>
);

/** Карточка операции журнала (ТЗ, п. 3.2: клик по строке). */
export default function OperationCard({ id, projects, onClose, onChanged, onError }: OperationCardProps) {
  const [op, setOp] = useState<ApiOperationCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveTo, setMoveTo] = useState('');

  useEffect(() => {
    let alive = true;
    api.operation(id)
      .then(o => { if (alive) { setOp(o); setMoveTo(o.projectId ? String(o.projectId) : ''); } })
      .catch((e: unknown) => onError(e instanceof ApiError ? e.message : 'Не удалось открыть операцию'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = async (action: 'confirm' | 'delete' | 'project', projectId?: number) => {
    if (action === 'delete' && !window.confirm('Удалить операцию? Она исчезнет из журнала и план-факта.')) return;
    setBusy(true);
    try {
      await api.bulkOperations([id], action, projectId);
      onChanged();
      if (action === 'delete') onClose();
      else setOp(await api.operation(id));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusy(false);
    }
  };

  const sign = op ? (op.type === 'in' ? '+' : '−') : '';
  const color = op?.type === 'in' ? '#1A7A4B' : '#B93227';

  return (
    <div data-operation-card style={{ position: 'fixed', inset: 0, zIndex: 68 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '96vw', background: '#FBFAF7', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: '#fff', borderBottom: '1px solid #E7E5E0' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Операция</div>
            <div style={{ fontSize: 11.5, color: '#8A918D' }}>{op ? `${TYPE_LABEL[op.type] ?? op.type} · ${fmtD(op.date)}` : 'Загрузка…'}</div>
          </div>
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A918D' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>

        {op && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color, ...num }}>{sign}{fmt(Math.abs(op.amount))}</div>
                <div style={{ fontSize: 12, color: '#A6ACA8' }}>TJS</div>
                <Badge b={op.confirmed ? badge('Оплата подтверждена', 'green') : badge('Не подтверждена', 'yellow')} />
                {op.isPlan && <Badge b={badge('План', 'blue')} />}
              </div>
              {op.currency !== 'TJS' && (
                <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 4, fontFamily: PLEX }}>
                  {fmt(op.amountOriginal)} {op.currency} · курс {op.rate}{op.rateDate ? ` на ${fmtD(op.rateDate)}` : ''}
                </div>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '4px 16px 12px', marginBottom: 14 }}>
              {row('Дата', <span style={{ fontFamily: PLEX }}>{fmtD(op.date)}</span>)}
              {row('Счёт', op.account ?? '—')}
              {row('Контрагент', op.party ?? '—')}
              {row('Статья', op.article ?? '—')}
              {row('Проект', op.project ?? '—')}
              {row('Примечание', op.comment || '—')}
              {op.externalRef && row('Источник', <span style={{ fontFamily: PLEX }}>{op.externalRef}</span>)}
            </div>

            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D', marginBottom: 10 }}>ДЕЙСТВИЯ</div>
              {op.locked ? (
                <div style={{ fontSize: 12.5, color: '#8A918D', lineHeight: 1.5 }}>
                  Операция создана одобренной заявкой и не изменяется — по ТЗ её можно только сторнировать
                  (кнопка «Сторнировать» в карточке строки на экране «Расходы»).
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {!op.confirmed && (
                      <div onClick={busy ? undefined : () => void act('confirm')} className="hv-dim"
                        style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Подтвердить оплату</div>
                    )}
                    <div onClick={busy ? undefined : () => void act('delete')} className="hv-soft"
                      style={{ border: '1px solid #F0CFC9', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: '#B93227', cursor: 'pointer' }}>Удалить</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Перенести в проект</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={moveTo} onChange={e => setMoveTo(e.target.value)}
                      style={{ flex: 1, height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' }}>
                      <option value="">— выберите —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div onClick={busy || !moveTo ? undefined : () => void act('project', Number(moveTo))} className="hv-soft"
                      style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: moveTo ? '#3E4643' : '#A6ACA8', cursor: moveTo ? 'pointer' : 'default' }}>Перенести</div>
                  </div>
                </>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D', marginBottom: 10 }}>ИСТОРИЯ</div>
              {op.history.length === 0 && <div style={{ fontSize: 12.5, color: '#8A918D' }}>Изменений не было.</div>}
              {op.history.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 12 }}>
                  <span style={{ color: '#A6ACA8', fontFamily: PLEX, flex: 'none' }}>{new Date(h.at).toLocaleDateString('ru-RU')}</span>
                  <span style={{ flex: 1 }}>{ACTION_LABEL[h.action] ?? h.action}</span>
                  <span style={{ color: '#8A918D' }}>{h.user}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
