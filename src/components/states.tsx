import { useState, type CSSProperties, type ReactNode } from 'react';
import { ACC } from '../theme';

/* ── Скелетоны загрузки ────────────────────────────────────────────────────
   Пульсирующая заглушка вместо надписи «Загрузка…»: она держит раскладку,
   поэтому при появлении данных страница не прыгает. */

const shimmer: CSSProperties = {
  background: 'var(--fin-divider)',
  borderRadius: 6,
  animation: 'finPulse 1.2s ease-in-out infinite',
};

/** Полоска-заглушка заданной ширины. */
export function SkeletonLine({ w = '100%', h = 12, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <span style={{ ...shimmer, display: 'block', width: w, height: h, ...style }} />;
}

/** Скелетон таблицы: шапка и несколько строк в высоту текущей плотности. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  const widths = ['22%', '34%', '18%', '14%', '12%', '16%', '20%'];
  return (
    <div data-skeleton style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 16, padding: 'var(--row-pad)', background: 'var(--fin-surface-alt)', borderBottom: '1px solid var(--fin-border)' }}>
        {Array.from({ length: cols }, (_, i) => (
          <SkeletonLine key={i} w={widths[i % widths.length]} h={9} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 'var(--fin-row-h)', padding: 'var(--row-pad)', borderBottom: r === rows - 1 ? 'none' : '1px solid var(--fin-divider)' }}>
          {Array.from({ length: cols }, (_, c) => (
            <SkeletonLine key={c} w={widths[(r + c) % widths.length]} h={11} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Скелетон ряда карточек-показателей. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div data-skeleton style={{ display: 'grid', gridTemplateColumns: `repeat(${count},minmax(0,1fr))`, gap: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonLine w="45%" h={9} />
          <SkeletonLine w="70%" h={22} />
          <SkeletonLine w="85%" h={9} />
        </div>
      ))}
    </div>
  );
}

/* ── Пустые состояния ──────────────────────────────────────────────────────
   Правило пакета: пустое состояние называет действие («Добавьте первый
   проект»), а не констатирует пустоту («Нет данных»). Кнопка — глагол и
   результат: она должна вести туда, где пустота исчезнет. */

export type EmptyTone = 'accent' | 'neutral' | 'plus' | 'warn';

const TONE: Record<EmptyTone, { bg: string; fg: string }> = {
  accent: { bg: 'var(--fin-accent-soft)', fg: 'var(--fin-accent)' },
  neutral: { bg: 'var(--fin-neutral-soft)', fg: 'var(--fin-text-3)' },
  plus: { bg: 'var(--fin-plus-soft)', fg: 'var(--fin-plus)' },
  warn: { bg: 'var(--fin-warn-soft)', fg: 'var(--fin-warn)' },
};

export interface EmptyStateProps {
  /** plus — «хорошая новость» (всё разобрано), warn — нет прав,
   *  neutral — фильтр не совпал, accent — данных ещё нет. */
  tone?: EmptyTone;
  title: string;
  text: string;
  /** Глагол и результат: «Сбросить фильтры», «Добавить операцию». */
  action?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ tone = 'accent', title, text, action, onAction, icon }: EmptyStateProps) {
  const t = TONE[tone];
  return (
    <div
      data-empty
      style={{
        background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12,
        padding: '52px 24px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center', gap: 8,
      }}
    >
      <span style={{ width: 52, height: 52, borderRadius: '50%', background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon ?? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
      </span>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', maxWidth: 380, lineHeight: 1.6 }}>{text}</div>
      {action && onAction && (
        <button
          type="button" data-empty-action onClick={onAction}
          style={{
            marginTop: 6, height: 'var(--fin-ctrl-h)', padding: '0 16px', borderRadius: 8,
            border: '1px solid var(--fin-border)', background: 'var(--fin-surface)',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}
        >{action}</button>
      )}
    </div>
  );
}

/* ── Ошибки ────────────────────────────────────────────────────────────────
   Правила текста из пакета:
     · без «Упс» и восклицаний — это бухгалтерия;
     · сразу говорить о сохранности введённого;
     · техника под «Подробности», с копированием — она нужна поддержке;
     · не блокировать весь экран: гаснет виджет, а не страница. */

export interface ErrorStateProps {
  /** Что не получилось, без восклицаний: «Журнал не загрузился». */
  title: string;
  /** Отвечает на первый вопрос человека — потерял ли он введённое. */
  reassure?: string;
  /** Техническая часть: код и сообщение сервера. */
  detail?: string | null;
  onRetry?: () => void;
  /** Компактный вид — для карточки внутри экрана. */
  compact?: boolean;
}

export function ErrorState({ title, reassure, detail, onRetry, compact }: ErrorStateProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена может быть запрещён политикой — текст всё равно виден
      setCopied(false);
    }
  };

  return (
    <div
      data-error
      style={{
        background: 'var(--fin-minus-soft)', borderRadius: 12,
        padding: compact ? '14px 16px' : '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <span style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', background: 'var(--fin-minus)', color: 'var(--fin-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>!</span>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fin-minus)' }}>{title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--fin-text-2)', lineHeight: 1.55 }}>
            {reassure ?? 'Введённое сохранено — ничего не потеряно.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onRetry && (
          <button
            type="button" data-error-retry onClick={onRetry}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--fin-minus)', color: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >Повторить</button>
        )}
        {detail && (
          <button
            type="button" data-error-details onClick={() => setOpen((v) => !v)}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--fin-minus)', background: 'transparent', color: 'var(--fin-minus)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >{open ? 'Скрыть подробности' : 'Подробности'}</button>
        )}
      </div>

      {open && detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <pre data-error-detail style={{
            margin: 0, padding: '10px 12px', borderRadius: 8, background: 'var(--fin-surface)',
            fontFamily: "'IBM Plex Sans',monospace", fontSize: 11.5, lineHeight: 1.55,
            color: 'var(--fin-text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{detail}</pre>
          <button
            type="button" onClick={copy}
            style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: copied ? ACC : 'var(--fin-text-2)' }}
          >{copied ? 'Скопировано' : 'Скопировать для поддержки'}</button>
        </div>
      )}
    </div>
  );
}
