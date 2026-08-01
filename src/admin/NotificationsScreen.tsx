import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, num } from '../theme';
import { api, ApiError, type ApiNotification } from '../lib/api';
import { useIsMobile } from '../lib/responsive';

/** Куда ведёт уведомление. Правило пакета: уведомление ведёт к действию —
 *  клик открывает саму заявку или карточку остатка, а не список. */
export type NotifyTarget =
  | { screen: 'approvals'; requestId?: number }
  | { screen: 'stock' }
  | { screen: 'tasks' }
  | { screen: 'planning' }
  | { screen: 'history' };

export interface NotificationsScreenProps {
  /** Переход по клику; экран-получатель определяется оболочкой (панель или кабинет). */
  onOpen: (t: NotifyTarget) => void;
  /** Лента изменилась — обновить колокольчик. */
  onChanged: () => void;
  onError: (msg: string | null) => void;
  /** Роль решает, куда ведёт уведомление о заявке. */
  role: string;
}

const TONE: Record<string, { bg: string; fg: string; glyph: string }> = {
  request: { bg: 'var(--fin-accent-soft)', fg: 'var(--fin-accent)', glyph: '↑' },
  approved: { bg: 'var(--fin-plus-soft)', fg: 'var(--fin-plus)', glyph: '✓' },
  rejected: { bg: 'var(--fin-minus-soft)', fg: 'var(--fin-minus)', glyph: '×' },
  overdue: { bg: 'var(--fin-minus-soft)', fg: 'var(--fin-minus)', glyph: '!' },
  stock: { bg: 'var(--fin-warn-soft)', fg: 'var(--fin-warn)', glyph: '≡' },
  task: { bg: 'var(--fin-neutral-soft)', fg: 'var(--fin-text-3)', glyph: '•' },
};
const tone = (kind: string) => TONE[kind] ?? TONE.task;

/** Ключ события → экран. Ключи задаёт сервер: «req:12», «stock:3», «task:7». */
function targetOf(n: ApiNotification, role: string): NotifyTarget {
  const [prefix, rawId] = n.id.split(':');
  const id = Number(rawId);
  if (prefix === 'req') {
    return role === 'accountant'
      ? { screen: 'history' }
      : { screen: 'approvals', requestId: Number.isFinite(id) ? id : undefined };
  }
  if (prefix === 'stock') return { screen: 'stock' };
  if (prefix === 'plan') return { screen: 'planning' };
  return { screen: 'tasks' };
}

/** «Сегодня» / «Вчера» / дата — группировка ленты как в макете. */
function dayLabel(date: string | null): string {
  if (!date) return 'Без даты';
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (date === iso(d0)) return 'Сегодня';
  const y = new Date(d0);
  y.setDate(y.getDate() - 1);
  if (date === iso(y)) return 'Вчера';
  if (date < iso(d0)) return 'Ранее';
  return 'Позже';
}

const DAY_ORDER = ['Позже', 'Сегодня', 'Вчера', 'Ранее', 'Без даты'];

const dayHead: CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--fin-text-4)', margin: '4px 0 2px',
};

/** Экран уведомлений (макет «Уведомления»).
 *
 *  Лента считается из данных — отдельной таблицы событий нет. Хранится
 *  только то, чего из данных не вывести: прочёл ли конкретный человек
 *  конкретное событие. Директор прочитал — у бухгалтера уведомление
 *  осталось непрочитанным. */
export default function NotificationsScreen({ onOpen, onChanged, onError, role }: NotificationsScreenProps) {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    api.notifications()
      .then((r) => { setItems(r.items); setLoaded(true); onError(null); })
      .catch((e) => { setLoaded(true); onError(e instanceof ApiError ? e.message : 'Не удалось загрузить уведомления'); });
  };
  useEffect(load, []);

  const unread = items.filter((i) => !i.read);
  const list = tab === 'unread' ? unread : items;

  const groups = useMemo(() => {
    const map = new Map<string, ApiNotification[]>();
    for (const n of list) {
      const k = dayLabel(n.date);
      const arr = map.get(k) ?? [];
      arr.push(n);
      map.set(k, arr);
    }
    return DAY_ORDER.filter((d) => map.has(d)).map((d) => [d, map.get(d)!] as const);
  }, [list]);

  const markRead = async (keys?: string[]) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.markNotificationsRead(keys);
      load();
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось отметить прочитанным');
    } finally {
      setBusy(false);
    }
  };

  const openItem = (n: ApiNotification) => {
    if (!n.read) void markRead([n.id]);
    onOpen(targetOf(n, role));
  };

  return (
    <div data-screen-label="Уведомления" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 860 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2 }}>
          {([['unread', `Непрочитанные${unread.length ? ` · ${unread.length}` : ''}`], ['all', `Все · ${items.length}`]] as const).map(([id, label]) => {
            const on = tab === id;
            return (
              <button
                key={id} type="button" data-notify-tab={id} onClick={() => setTab(id)}
                style={{
                  padding: '6px 14px', border: 'none', cursor: 'pointer', borderRadius: 7,
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 600 : 500,
                  background: on ? 'var(--fin-surface)' : 'transparent',
                  color: on ? 'var(--fin-text)' : 'var(--fin-text-3)',
                  boxShadow: on ? 'var(--fin-shadow-seg)' : 'none',
                }}
              >{label}</button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        {unread.length > 0 && (
          <button
            type="button" data-notify-read-all onClick={() => void markRead()} disabled={busy}
            style={{
              height: 'var(--fin-ctrl-h)', padding: '0 14px', borderRadius: 8,
              border: '1px solid var(--fin-border)', background: 'var(--fin-surface)',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
              color: 'var(--fin-text-2)', cursor: busy ? 'default' : 'pointer',
            }}
          >Прочитать все</button>
        )}
      </div>

      {list.length === 0 ? (
        <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '56px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--fin-plus-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--fin-plus)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {!loaded ? 'Загрузка…' : tab === 'unread' ? 'Всё прочитано' : 'Уведомлений нет'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', maxWidth: 340, lineHeight: 1.6 }}>
            {tab === 'unread'
              ? 'Новые появятся здесь: заявка на решение, остаток ниже минимума, просроченный платёж или задача.'
              : 'Пока ничего не происходило — лента наполнится по мере работы.'}
          </div>
          {tab === 'unread' && items.length > 0 && (
            <button
              type="button" onClick={() => setTab('all')}
              style={{ marginTop: 4, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >Показать все · {items.length}</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(([day, rows]) => (
            <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={dayHead}>{day}</div>
              <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
                {rows.map((n, i) => {
                  const t = tone(n.kind);
                  return (
                    <div
                      key={n.id} data-notify={n.id} onClick={() => openItem(n)} className="hv-row"
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: isMobile ? '12px 14px' : '13px 16px', cursor: 'pointer',
                        borderTop: i === 0 ? 'none' : '1px solid var(--fin-divider)',
                        background: n.read ? 'transparent' : 'var(--fin-surface-alt)',
                      }}
                    >
                      <span style={{
                        width: 32, height: 32, flex: 'none', borderRadius: 8, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                        background: t.bg, color: t.fg,
                      }}>{t.glyph}</span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 13.5, fontWeight: n.read ? 500 : 700, lineHeight: 1.35 }}>{n.title}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--fin-text-3)', lineHeight: 1.45 }}>{n.note}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
                        {n.date && <span style={{ ...num, fontSize: 11.5, color: 'var(--fin-text-4)', whiteSpace: 'nowrap' }}>{n.date}</span>}
                        {!n.read && <span data-notify-dot style={{ width: 8, height: 8, borderRadius: '50%', background: ACC, flex: 'none' }} />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', lineHeight: 1.6 }}>
        Отметка «прочитано» своя у каждого получателя: одно и то же событие может быть
        разобрано директором и оставаться непрочитанным у бухгалтера.
      </div>
    </div>
  );
}
