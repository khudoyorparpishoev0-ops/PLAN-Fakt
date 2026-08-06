import { useState } from 'react';
import { ACC, PLEX, num } from '../theme';
import { Badge } from '../components/ui';
import FilePreview from '../components/FilePreview';
import type { ExpRow } from '../lib/rows';
import { useEscapeClose } from '../lib/escape';

export interface ExpenseDrawerProps {
  sel: ExpRow;
  onClose: () => void;
  approve: (n: string) => void;
  decline: (n: string) => void;
  /** Сторнирование одобренной заявки (строки «План · заявка …», ТЗ п. 5). */
  onStorno?: (requestId: number) => void;
  onError?: (msg: string) => void;
}

/** Номер текущего шага согласования по статусу заявки (−1 — отклонено). */
const STEP_BY_STATUS: Record<string, number> = {
  'Черновик': 0, 'На согласовании': 2, 'Согласовано': 3, 'Ожидает оплаты': 3,
  'Частично оплачено': 3, 'Просрочено': 3, 'Оплачено': 5, 'Отклонено': -1,
};

interface Step { label: string; sub: string; bg: string; fg: string; bd: string; ch: string; labFg: string; lineBg: string }

function buildSteps(sel: ExpRow): Step[] {
  const cur = STEP_BY_STATUS[sel.status] ?? 5;
  const defs: [string, string][] = [
    ['Инициатор — заявка создана', sel.resp],
    ['Бухгалтер — проверка', 'М. Саидова'],
    ['Руководитель — согласование', 'Р. Рахимов'],
    ['Кассир / банк — оплата', 'З. Юсупова'],
    ['Оплачено — в отчёте «План–Факт»', 'автоматически'],
  ];
  return defs.map((d, i) => {
    const rejected = cur === -1 && i === 2;
    const done = cur === 5 || i < cur, curr = !done && i === cur && !rejected;
    return {
      label: d[0], sub: rejected ? 'Отклонено руководителем' : done ? d[1] : curr ? d[1] + ' · сейчас' : d[1],
      bg: rejected ? 'var(--fin-minus)' : done ? ACC : 'var(--fin-surface)', fg: rejected || done ? 'var(--fin-surface)' : curr ? ACC : 'var(--fin-text-5)',
      bd: done || rejected ? 'none' : curr ? '2px solid ' + ACC : '2px solid var(--fin-border)',
      ch: rejected ? '✕' : done ? '✓' : String(i + 1),
      labFg: done || curr || rejected ? 'var(--fin-text)' : 'var(--fin-text-5)',
      lineBg: i === defs.length - 1 ? 'transparent' : done ? ACC : 'var(--fin-border)',
    };
  });
}

const secHead = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)' } as const;
const detRow = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed var(--fin-divider)', padding: '5px 0' } as const;
const docChip = { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--fin-border)', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' } as const;

export default function ExpenseDrawer(props: ExpenseDrawerProps) {
  useEscapeClose(props.onClose);
  /** Превью документа заявки прямо в шторке (ТЗ, п. 10). */
  const [preview, setPreview] = useState<{ id: number; fileName: string } | null>(null);
  const { sel, onClose } = props;
  const steps = buildSteps(sel);
  const hasReason = sel.fact > sel.plan;
  const reason = sel.reason ?? 'Рост цены';
  const approval = sel.status === 'На согласовании';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, maxWidth: '94vw', background: 'var(--fin-surface)', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 22px', borderBottom: '1px solid var(--fin-divider)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{sel.cat}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>Заявка {sel.n} · {sel.proj}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Badge b={sel.b} style={{ marginTop: 2 }} />
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg></div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: 'var(--fin-surface-alt)', border: '1px solid var(--fin-divider)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
            <div><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>ПЛАН</div><div style={{ fontSize: 15, fontWeight: 600, ...num }}>{sel.planF}</div></div>
            <div><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>ФАКТ</div><div style={{ fontSize: 15, fontWeight: 700, ...num }}>{sel.factF}</div></div>
            <div><div style={{ fontSize: 10.5, color: 'var(--fin-text-5)', fontWeight: 600 }}>ОТКЛОНЕНИЕ</div><div style={{ fontSize: 15, fontWeight: 700, color: sel.devFg, ...num }}>{sel.devF}</div></div>
          </div>
          <div style={{ ...secHead, margin: '0 0 12px' }}>СОГЛАСОВАНИЕ</div>
          {steps.map((st, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: st.bg, color: st.fg, border: st.bd, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{st.ch}</div>
                <div style={{ width: 2, flex: 1, minHeight: 16, background: st.lineBg, margin: '3px 0' }} />
              </div>
              <div style={{ paddingBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: st.labFg }}>{st.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>{st.sub}</div>
              </div>
            </div>
          ))}
          <div style={{ ...secHead, margin: '6px 0 10px' }}>ДЕТАЛИ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 16 }}>
            <div style={detRow}><span style={{ color: 'var(--fin-text-4)' }}>Получатель</span><span style={{ fontWeight: 500 }}>{sel.payee}</span></div>
            <div style={detRow}><span style={{ color: 'var(--fin-text-4)' }}>Способ</span><span style={{ fontWeight: 500 }}>Банковский перевод</span></div>
            <div style={detRow}><span style={{ color: 'var(--fin-text-4)' }}>Дата план</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{sel.pdate + '.2026'}</span></div>
            <div style={detRow}><span style={{ color: 'var(--fin-text-4)' }}>Дата факт</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{sel.fdate}</span></div>
            <div style={detRow}><span style={{ color: 'var(--fin-text-4)' }}>Инициатор</span><span style={{ fontWeight: 500 }}>{sel.resp}</span></div>
          </div>
          {hasReason && (
            <div style={{ background: 'var(--fin-warn-soft)', border: '1px solid var(--fin-warn-soft)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fin-warn)', letterSpacing: '.04em', marginBottom: 3 }}>ПРИЧИНА ОТКЛОНЕНИЯ</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{reason}</div>
              <div style={{ fontSize: 12, color: 'var(--fin-warn)', marginTop: 2 }}>Комментарий обязателен при значительном отклонении от плана.</div>
            </div>
          )}
          <div style={{ ...secHead, margin: '0 0 10px' }}>ДОКУМЕНТЫ</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(sel.attachments ?? []).map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  if (!a.hasFile) { props.onError?.(`«${a.fileName}» — демо-имя, файла нет`); return; }
                  setPreview({ id: a.id, fileName: a.fileName });
                }}
                className="hv-row" style={docChip}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--fin-text-4)" strokeWidth="1.5"><path d="M3 1.5h6L11.5 4v8.5h-8.5z" /></svg>
                {a.fileName}
              </div>
            ))}
            {(sel.attachments ?? []).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fin-text-5)' }}>Документы не приложены</div>
            )}
          </div>
        </div>
        {approval ? (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--fin-divider)' }}>
            <div onClick={() => props.decline(sel.n)} className="hv-red" style={{ border: '1px solid var(--fin-minus-soft)', color: 'var(--fin-minus)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Отклонить</div>
            <div onClick={() => props.approve(sel.n)} className="hv-dim" style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Согласовать</div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--fin-divider)' }}>
            {sel.requestId != null && !sel.storno && props.onStorno && (
              <div
                onClick={() => props.onStorno!(sel.requestId!)}
                title="Погасить плановую операцию обратной записью (ТЗ, п. 5)"
                className="hv-red"
                style={{ border: '1px solid var(--fin-minus-soft)', color: 'var(--fin-minus)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 'auto' }}
              >
                Сторнировать
              </div>
            )}
            <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Закрыть</div>
          </div>
        )}
      </div>

      {preview && (
        <FilePreview
          id={preview.id}
          fileName={preview.fileName}
          onClose={() => setPreview(null)}
          onError={msg => props.onError?.(msg)}
        />
      )}
    </div>
  );
}
