import type { CSSProperties, ReactNode } from 'react';
import { ACC } from '../theme';
import type { BadgeData } from '../lib/badges';

/** Статус-бейдж с цветной точкой. По умолчанию — табличный вариант (11.5px / 3px 9px / точка 6px). */
export function Badge({ b, fs = 11.5, pad = '3px 9px', dot = 6, style }: {
  b: BadgeData; fs?: number; pad?: string; dot?: number; style?: CSSProperties;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 99, fontSize: fs, fontWeight: 600, color: b.fg, background: b.bg, whiteSpace: 'nowrap', ...style }}>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: b.dot }} />
      {b.t}
    </span>
  );
}

/** Чекбокс-строка панели фильтров (18px, заливка акцентом при включении). */
export function CheckRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', cursor: 'pointer' }}>
      <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? ACC : 'var(--fin-border)'}`, background: on ? ACC : 'var(--fin-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--fin-surface)" strokeWidth="2" style={{ opacity: on ? 1 : 0 }}><path d="M1.5 5.2L4 7.5l4.5-5" /></svg>
      </span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

/** Заголовок колонки таблицы (10.5px uppercase). */
export function Th({ style, children, right }: { style?: CSSProperties; children?: ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--fin-text-4)', textAlign: right ? 'right' : 'left', borderBottom: '1px solid var(--fin-border)', ...style }}>
      {children}
    </th>
  );
}

/** Кнопка-акцент (зелёная, белый текст, hover brightness .94). */
export function AccentBtn({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <div onClick={onClick} className="hv-dim" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...style }}>
      {children}
    </div>
  );
}

/** Логотип IT-HONA (треугольник). */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 28 / 32)} viewBox="0 0 40 34" style={{ flex: 'none' }}>
      <path d="M20 1L39 33H1Z" fill="var(--fin-logo)" />
      <path d="M20 12.5L30.5 31h-21z" fill="var(--fin-logo-dark)" />
    </svg>
  );
}
