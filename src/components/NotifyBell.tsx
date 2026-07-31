import { useEffect, useRef, useState } from 'react';
import { ACC, PLEX } from '../theme';
import { fmtD } from '../lib/format';
import { api, type ApiNotification } from '../lib/api';
import { TAP, useIsMobile } from '../lib/responsive';

/** Цвет метки уведомления по его типу. */
const KIND_COLOR: Record<string, { bg: string; fg: string }> = {
  request: { bg: '#E7EEF9', fg: '#3D62B3' },
  approved: { bg: '#E6F4EB', fg: '#1A7A4B' },
  rejected: { bg: '#FAE7E4', fg: '#B93227' },
  overdue: { bg: '#FAE7E4', fg: '#B93227' },
  stock: { bg: '#FBF0DC', fg: '#8A6410' },
  task: { bg: '#EFEEEA', fg: '#5A625E' },
};

const KIND_ICON: Record<string, string> = {
  request: '!', approved: '✓', rejected: '×', overdue: '!', stock: '≡', task: '•',
};

export interface NotifyBellProps {
  /** Сигнал перечитать список (после решения по заявке, движения склада и т. п.). */
  refreshTick?: number;
}

/** Колокольчик в шапке: уведомления по роли (заявки, просрочки, склад, задачи). */
export default function NotifyBell({ refreshTick = 0 }: NotifyBellProps) {
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    let alive = true;
    api.notifications()
      .then(r => { if (alive) setItems(r.items); })
      .catch(() => { /* уведомления не критичны — молча пропускаем */ });
    return () => { alive = false; };
  }, [refreshTick]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const size = isMobile ? TAP : 38;

  return (
    <div ref={box} style={{ position: 'relative', flex: 'none' }}>
      <div
        onClick={() => setOpen(v => !v)}
        title="Уведомления"
        data-notify-bell
        className="hv-soft"
        style={{ position: 'relative', width: size, height: size, borderRadius: 9, border: '1px solid #E7E5E0', background: open ? '#F1F0EB' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5A625E' }}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6.5a4 4 0 018 0c0 3 1.2 4 1.2 4H2.8S4 9.5 4 6.5z" /><path d="M6.5 13a1.5 1.5 0 003 0" /></svg>
        {items.length > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 99, background: '#D24A3D', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{items.length}</span>
        )}
      </div>

      {open && (
        <div data-notify-panel style={{ position: 'absolute', top: size + 8, right: 0, zIndex: 60, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 420, overflowY: 'auto', background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, boxShadow: '0 14px 36px rgba(0,0,0,.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #F0EFEA' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Уведомления</span>
            <span style={{ fontSize: 11.5, color: '#8A918D' }}>{items.length ? `${items.length} шт.` : 'нет новых'}</span>
          </div>
          {items.length === 0 && (
            <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12.5, color: '#8A918D' }}>Всё спокойно — новых событий нет.</div>
          )}
          {items.map(n => {
            const c = KIND_COLOR[n.kind] ?? KIND_COLOR.task;
            return (
              <div key={n.id} style={{ display: 'flex', gap: 10, padding: '11px 14px', borderBottom: '1px solid #F6F5F1' }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.fg, fontSize: 13, fontWeight: 700 }}>{KIND_ICON[n.kind] ?? '•'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{n.title}</div>
                  <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 2 }}>{n.note}</div>
                </div>
                {n.date && <div style={{ fontSize: 11, color: '#A6ACA8', fontFamily: PLEX, flex: 'none' }}>{fmtD(n.date)}</div>}
              </div>
            );
          })}
          <div style={{ padding: '10px 14px', fontSize: 11.5, color: '#8A918D' }}>
            Список формируется по вашей роли: <span style={{ color: ACC, fontWeight: 600 }}>заявки, просрочки, склад и задачи</span>.
          </div>
        </div>
      )}
    </div>
  );
}
