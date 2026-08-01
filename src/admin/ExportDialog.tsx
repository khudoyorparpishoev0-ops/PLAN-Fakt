import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, num } from '../theme';
import { useEscapeClose } from '../lib/escape';
import { useIsMobile } from '../lib/responsive';
import { api, ApiError, type ApiExportColumn, type OperationQuery } from '../lib/api';

export type ExportKind = 'report' | 'projects' | 'operations';

export interface ExportDialogProps {
  kind: ExportKind;
  /** Фильтры экрана — уходят в файл и на лист «Параметры» (правило 1). */
  query?: OperationQuery;
  /** Сколько строк сейчас в выборке — для оценки размера файла. */
  rowCount?: number;
  onClose: () => void;
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 90, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
};
const sectionLbl: CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--fin-text-4)',
};

/** Грубая оценка веса книги: заголовки, строки и накладные расходы zip.
 *  Точное число тут не нужно — важно, отдаёт ли кнопка 20 КБ или 3 МБ. */
function estimate(rows: number, cols: number): string {
  const bytes = 9000 + rows * cols * 22;
  return bytes < 1024 * 1024
    ? `≈ ${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `≈ ${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Диалог выгрузки в Excel (макет «Экспорт в Excel»).
 *
 *  Колонки снимаются чекбоксами, предпросмотр листа перестраивается, имя
 *  файла и оценка размера пересчитываются. Ключевые колонки заблокированы:
 *  без даты и суммы журнал операций перестаёт быть журналом, и файл не
 *  сойдётся с отчётом на экране. */
export default function ExportDialog({ kind, query, rowCount, onClose }: ExportDialogProps) {
  useEscapeClose(onClose);
  const isMobile = useIsMobile();
  const [all, setAll] = useState<ApiExportColumn[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    api.exportColumns()
      .then((r) => {
        const k = r.kinds.find((x) => x.code === kind);
        setAll(k?.columns ?? []);
        setName(k?.name ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось получить состав колонок'));
  }, [kind]);

  const picked = useMemo(() => all.filter((c) => c.locked || !off.has(c.key)), [all, off]);

  const toggle = (c: ApiExportColumn) => {
    if (c.locked) return;
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
      return next;
    });
  };

  const today = new Date().toISOString().slice(0, 10);
  const base = kind === 'report' ? 'план-факт' : kind === 'projects' ? 'проекты' : 'операции';
  const part = all.length && picked.length < all.length ? `-${picked.length}из${all.length}` : '';
  const fileName = `${base}-${today}${part}.xlsx`;

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      // Полный состав не передаём — сервер и так отдаст всё
      const cols = picked.length === all.length ? undefined : picked.map((c) => c.key);
      await api.downloadExport(kind, query, cols);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сформировать файл');
      setBusy(false);
    }
  };

  return (
    <div style={overlay}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div
        data-export-dialog
        style={{
          position: 'relative', width: 720, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--fin-surface)', borderRadius: 12, boxShadow: 'var(--fin-shadow-modal)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--fin-divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Выгрузка в Excel</div>
            <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', marginTop: 2 }}>{name}</div>
          </div>
          <div style={{ flex: 1 }} />
          <span onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </span>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={sectionLbl}>Колонки</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px 18px' }}>
              {all.map((c) => {
                const on = c.locked || !off.has(c.key);
                return (
                  <label
                    key={c.key} data-col={c.key}
                    title={c.locked ? 'Без этой колонки файл не сойдётся с экраном' : undefined}
                    onClick={() => toggle(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, minHeight: 30,
                      cursor: c.locked ? 'not-allowed' : 'pointer',
                      opacity: c.locked ? 0.75 : 1,
                    }}
                  >
                    <span style={{
                      width: 17, height: 17, flex: 'none', borderRadius: 5, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: `1.5px solid ${on ? ACC : 'var(--fin-border)'}`,
                      background: on ? ACC : 'var(--fin-surface)',
                    }}>
                      {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fin-surface)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    <span style={{ fontSize: 13 }}>{c.title}</span>
                    {c.locked && <span style={{ fontSize: 11, color: 'var(--fin-text-5)' }}>🔒</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Предпросмотр листа — перестраивается вместе с выбором */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={sectionLbl}>Предпросмотр листа</div>
            <div style={{ border: '1px solid var(--fin-border)', borderRadius: 10, overflowX: 'auto' }}>
              <table data-export-preview style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                <thead><tr>
                  {picked.map((c) => (
                    <th key={c.key} style={{
                      padding: '8px 12px', whiteSpace: 'nowrap',
                      fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
                      color: 'var(--fin-text-4)', background: 'var(--fin-surface-alt)',
                      borderBottom: '1px solid var(--fin-border)',
                      textAlign: c.type === 'money' ? 'right' : 'left',
                    }}>{c.title}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[0, 1].map((i) => (
                    <tr key={i}>
                      {picked.map((c) => (
                        <td key={c.key} style={{
                          padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 12.5,
                          borderBottom: '1px solid var(--fin-divider)',
                          color: 'var(--fin-text-4)',
                          textAlign: c.type === 'money' ? 'right' : 'left',
                          ...(c.type === 'money' || c.type === 'date' ? num : {}),
                        }}>
                          {c.type === 'money' ? '0,00' : c.type === 'date' ? '01.08.2026' : '…'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', lineHeight: 1.6 }}>
              Числа выгружаются числами, даты — датами; шапка закреплена и повторяется
              при печати. Второй лист «Параметры» запишет, кто, когда и с какими
              фильтрами снял выгрузку.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 14px', background: 'var(--fin-surface-alt)', borderRadius: 10 }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>Имя файла</div>
              <div data-export-name style={{ ...num, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>Колонок</div>
              <div style={{ ...num, fontSize: 13, fontWeight: 600 }}>{picked.length} из {all.length}</div>
            </div>
            {rowCount != null && (
              <>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>Строк</div>
                  <div style={{ ...num, fontSize: 13, fontWeight: 600 }}>{rowCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>Размер</div>
                  <div data-export-size style={{ ...num, fontSize: 13, fontWeight: 600 }}>{estimate(rowCount, picked.length)}</div>
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{ background: 'var(--fin-minus-soft)', color: 'var(--fin-minus)', borderRadius: 8, padding: '10px 13px', fontSize: 12.5 }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--fin-divider)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button" onClick={onClose}
            style={{ height: 'var(--fin-ctrl-h)', padding: '0 16px', border: '1px solid var(--fin-border)', borderRadius: 8, background: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >Отмена</button>
          <button
            type="button" data-export-go onClick={download} disabled={busy || all.length === 0}
            style={{
              height: 'var(--fin-ctrl-h)', padding: '0 18px', border: 'none', borderRadius: 8,
              background: busy || all.length === 0 ? 'var(--fin-segment)' : ACC,
              color: busy || all.length === 0 ? 'var(--fin-text-4)' : 'var(--fin-surface)',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            }}
          >{busy ? 'Формируем…' : 'Скачать'}</button>
        </div>
      </div>
    </div>
  );
}
