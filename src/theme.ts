import type { CSSProperties } from 'react';

/** Цвета берутся из tokens.css — здесь только имена переменных.
 *  Хексов в этом файле нет намеренно: тема должна жить в одном месте,
 *  иначе она разъезжается между CSS и кодом. */
const V = (name: string) => `var(--fin-${name})`;

/** Статусные бейджи: пять состояний дизайн-системы — приход, расход,
 *  внимание, нейтральное, акцент. Точка бейджа красится тем же цветом,
 *  что и текст: отдельного оттенка для неё в системе нет.
 *
 *  Ключи yellow / orange / blue оставлены псевдонимами, чтобы не править
 *  полсотни мест вызова. Смысл при этом сведён к токенам:
 *    yellow и orange → «внимание» (цвет предупреждения в системе один),
 *    blue → акцент («В работе», «Плановый», «Новая»).
 *  Правило дизайн-системы: новый статус берёт существующий цвет или
 *  получает нейтральный серый — своих оттенков не заводим. */
const kind = (fg: string, bg: string) => ({ fg: V(fg), bg: V(bg), dot: V(fg) });

export const C = {
  green: kind('plus', 'plus-soft'),
  red: kind('minus', 'minus-soft'),
  orange: kind('warn', 'warn-soft'),
  yellow: kind('warn', 'warn-soft'),
  gray: kind('neutral', 'neutral-soft'),
  blue: kind('accent', 'accent-soft'),
} as const;
export type BadgeColor = keyof typeof C;

/* ── Часто используемые токены под именами, привычными экранам ─────────── */
export const ACC = V('accent');
export const SOFT = V('accent-soft');
export const ROW_PAD = 'var(--row-pad)';
export const CARD_PAD = 'var(--card-pad)';

export const PLEX = "'IBM Plex Sans',sans-serif";
export const GOLOS = "'Golos Text',sans-serif";

/** Табличные цифры IBM Plex Sans. */
export const num: CSSProperties = { fontFamily: PLEX, fontVariantNumeric: 'tabular-nums' };

export type Density = 'Комфортная' | 'Компактная';

/** Тема: акцент и плотность.
 *
 *  Плотность — не пара отступов, а весь набор из tokens.css: высота строки,
 *  поля ячейки, высота контролов и размеры шрифта. Поэтому переключается
 *  атрибутом data-fin-density на корне документа, а не отдельными
 *  переменными — иначе половина значений осталась бы комфортной. */
export function applyThemeVars(accent?: string, density: Density = 'Комфортная') {
  const root = document.documentElement;
  root.setAttribute('data-fin-density', density === 'Компактная' ? 'compact' : 'comfort');
  // Акцент переопределяем, только когда его действительно меняют:
  // иначе пусть работает значение из tokens.css.
  if (accent) {
    root.style.setProperty('--fin-accent', accent);
    root.style.setProperty('--fin-accent-hover', accent);
  } else {
    root.style.removeProperty('--fin-accent');
    root.style.removeProperty('--fin-accent-hover');
  }
}
