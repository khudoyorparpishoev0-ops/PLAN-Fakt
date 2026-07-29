import type { CSSProperties } from 'react';

/** Статусные цвета бейджей: текст / фон / точка. */
export const C = {
  green: { fg: '#1A7A4B', bg: '#E6F4EB', dot: '#22935B' },
  yellow: { fg: '#8A6A00', bg: '#FAF2D8', dot: '#C9A227' },
  orange: { fg: '#B25313', bg: '#FBECDE', dot: '#D97430' },
  red: { fg: '#B93227', bg: '#FAE7E4', dot: '#D24A3D' },
  gray: { fg: '#66706C', bg: '#EFEEEA', dot: '#9AA29E' },
  blue: { fg: '#2A4D9B', bg: '#E9EDF7', dot: '#3D62B3' },
} as const;
export type BadgeColor = keyof typeof C;

/** Акцент бренда через CSS-переменные (тема настраивается на :root). */
export const ACC = 'var(--fin-accent,#1B7A3C)';
export const SOFT = 'var(--fin-accent-soft,#E6F2EA)';
export const ROW_PAD = 'var(--row-pad,9px 12px)';
export const CARD_PAD = 'var(--card-pad,15px 16px)';

export const PLEX = "'IBM Plex Sans',sans-serif";
export const GOLOS = "'Golos Text',sans-serif";

/** Табличные цифры IBM Plex Sans. */
export const num: CSSProperties = { fontFamily: PLEX, fontVariantNumeric: 'tabular-nums' };

/** Тема прототипа: акцент и плотность, применяются на documentElement. */
export function applyThemeVars(accent = '#1B7A3C', density: 'Комфортная' | 'Плотная' = 'Комфортная') {
  const soft: Record<string, string> = {
    '#1B7A3C': '#E6F2EA', '#0F5E56': '#E7F1EF', '#14532D': '#E4F0E7', '#2A4D9B': '#E9EDF7',
  };
  const dense = density === 'Плотная';
  const r = document.documentElement.style;
  r.setProperty('--fin-accent', accent);
  r.setProperty('--fin-accent-soft', soft[accent] ?? '#E7F1EF');
  r.setProperty('--row-pad', dense ? '5px 12px' : '9px 12px');
  r.setProperty('--card-pad', dense ? '12px 14px' : '15px 16px');
}
