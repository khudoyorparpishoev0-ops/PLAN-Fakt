import { useEffect, useRef, useState } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt, fmtD } from '../lib/format';
import { badge } from '../lib/badges';
import { api, ApiError, type ApiOperationCard, type ApiProject } from '../lib/api';
import { Badge } from '../components/ui';
import FilePreview from '../components/FilePreview';
import { useEscapeClose } from '../lib/escape';

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
  attach: 'Прикреплён документ',
  detach: 'Документ откреплён',
};

/** Размер файла человекочитаемо. */
const fileSize = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`);

/** Значок типа файла. */
const fileTag = (mime: string | null) =>
  mime === 'application/pdf' ? { t: 'PDF', bg: 'var(--fin-minus-soft)', fg: 'var(--fin-minus)' }
  : mime?.startsWith('image/') ? { t: 'IMG', bg: 'var(--fin-accent-soft)', fg: 'var(--fin-accent)' }
  : { t: 'ФАЙЛ', bg: 'var(--fin-divider)', fg: 'var(--fin-text-2)' };

const row = (label: string, value: React.ReactNode) => (
  <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 }}>
    <span style={{ color: 'var(--fin-text-4)', width: 118, flex: 'none' }}>{label}</span>
    <span style={{ minWidth: 0, flex: 1 }}>{value}</span>
  </div>
);

/** Карточка операции журнала (ТЗ, п. 3.2: клик по строке). */
export default function OperationCard({ id, projects, onClose, onChanged, onError }: OperationCardProps) {
  useEscapeClose(onClose);
  const [op, setOp] = useState<ApiOperationCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [preview, setPreview] = useState<{ id: number; fileName: string; mime: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = async () => setOp(await api.operation(id));

  /** Загрузить и прикрепить документ к операции (ТЗ, п. 10). */
  const attach = async (file: File) => {
    setUploading(true);
    try {
      const up = await api.upload(file);
      await api.attachToOperation(id, up);
      await reload();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось прикрепить документ');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const detach = async (attId: number, name: string) => {
    if (!window.confirm(`Открепить документ «${name}»?`)) return;
    try {
      await api.removeAttachment(attId);
      await reload();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось открепить документ');
    }
  };

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
      else await reload();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusy(false);
    }
  };

  const sign = op ? (op.type === 'in' ? '+' : '−') : '';
  const color = op?.type === 'in' ? 'var(--fin-plus)' : 'var(--fin-minus)';

  return (
    <div data-operation-card style={{ position: 'fixed', inset: 0, zIndex: 68 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '96vw', background: 'var(--fin-surface-alt)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'var(--fin-surface)', borderBottom: '1px solid var(--fin-border)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Операция</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{op ? `${TYPE_LABEL[op.type] ?? op.type} · ${fmtD(op.date)}` : 'Загрузка…'}</div>
          </div>
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>

        {op && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color, ...num }}>{sign}{fmt(Math.abs(op.amount))}</div>
                <div style={{ fontSize: 12, color: 'var(--fin-text-5)' }}>TJS</div>
                <Badge b={op.confirmed ? badge('Оплата подтверждена', 'green') : badge('Не подтверждена', 'yellow')} />
                {op.isPlan && <Badge b={badge('План', 'blue')} />}
              </div>
              {op.currency !== 'TJS' && (
                <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 4, fontFamily: PLEX }}>
                  {fmt(op.amountOriginal)} {op.currency} · курс {op.rate}{op.rateDate ? ` на ${fmtD(op.rateDate)}` : ''}
                </div>
              )}
            </div>

            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '4px 16px 12px', marginBottom: 14 }}>
              {row('Дата', <span style={{ fontFamily: PLEX }}>{fmtD(op.date)}</span>)}
              {row('Счёт', op.account ?? '—')}
              {row('Контрагент', op.party ?? '—')}
              {row('Статья', op.article ?? '—')}
              {row('Проект', op.project ?? '—')}
              {row('Примечание', op.comment || '—')}
              {op.externalRef && row('Источник', <span style={{ fontFamily: PLEX }}>{op.externalRef}</span>)}
            </div>

            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)' }}>ДОКУМЕНТЫ</span>
                <span onClick={uploading ? undefined : () => fileInput.current?.click()} data-attach-btn
                  style={{ fontSize: 12, fontWeight: 700, color: uploading ? 'var(--fin-text-5)' : ACC, cursor: uploading ? 'default' : 'pointer' }}>
                  {uploading ? 'ЗАГРУЖАЕМ…' : 'ПРИКРЕПИТЬ'}
                </span>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void attach(f); }}
              />
              {op.attachments.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', lineHeight: 1.5 }}>
                  Документов нет. Прикрепите счёт, акт или чек — JPG, PNG или PDF до 10 МБ.
                </div>
              )}
              {op.attachments.map(a => {
                const tag = fileTag(a.mime);
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid var(--fin-divider)' }}>
                    <span style={{ width: 28, height: 32, borderRadius: 5, background: tag.bg, color: tag.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flex: 'none' }}>{tag.t}</span>
                    <div onClick={() => a.hasFile && setPreview({ id: a.id, fileName: a.fileName, mime: a.mime })}
                      style={{ minWidth: 0, flex: 1, cursor: a.hasFile ? 'pointer' : 'default' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: a.hasFile ? ACC : 'var(--fin-text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--fin-text-5)' }}>{a.hasFile ? fileSize(a.size) || 'файл' : 'демо-имя, файла нет'}</div>
                    </div>
                    <div onClick={() => void detach(a.id, a.fileName)} title="Открепить" className="hv-cream"
                      style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)', flex: 'none' }}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', marginBottom: 10 }}>ДЕЙСТВИЯ</div>
              {op.locked ? (
                <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', lineHeight: 1.5 }}>
                  Операция создана одобренной заявкой и не изменяется — по ТЗ её можно только сторнировать
                  (кнопка «Сторнировать» в карточке строки на экране «Расходы»).
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {!op.confirmed && (
                      <div onClick={busy ? undefined : () => void act('confirm')} className="hv-dim"
                        style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Подтвердить оплату</div>
                    )}
                    <div onClick={busy ? undefined : () => void act('delete')} className="hv-soft"
                      style={{ border: '1px solid var(--fin-minus-soft)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-minus)', cursor: 'pointer' }}>Удалить</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 }}>Перенести в проект</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={moveTo} onChange={e => setMoveTo(e.target.value)}
                      style={{ flex: 1, height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 8px', fontSize: 13, background: 'var(--fin-surface)' }}>
                      <option value="">— выберите —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div onClick={busy || !moveTo ? undefined : () => void act('project', Number(moveTo))} className="hv-soft"
                      style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: moveTo ? 'var(--fin-text-2)' : 'var(--fin-text-5)', cursor: moveTo ? 'pointer' : 'default' }}>Перенести</div>
                  </div>
                </>
              )}
            </div>

            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', marginBottom: 10 }}>ИСТОРИЯ</div>
              {op.history.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Изменений не было.</div>}
              {op.history.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--fin-text-5)', fontFamily: PLEX, flex: 'none' }}>{new Date(h.at).toLocaleDateString('ru-RU')}</span>
                  <span style={{ flex: 1 }}>{ACTION_LABEL[h.action] ?? h.action}</span>
                  <span style={{ color: 'var(--fin-text-4)' }}>{h.user}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <FilePreview
          id={preview.id}
          fileName={preview.fileName}
          mime={preview.mime}
          onClose={() => setPreview(null)}
          onError={onError}
        />
      )}
    </div>
  );
}
