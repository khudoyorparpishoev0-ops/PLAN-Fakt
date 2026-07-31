/** Адаптив: ТЗ требует работу от 360px и цели нажатия ≥44px.
 *  Компоненты используют inline-стили, поэтому брейкпоинт отслеживается
 *  через matchMedia, а не через CSS-классы. */
import { useEffect, useState } from 'react';

/** Ширина, ниже которой включается мобильная раскладка
 *  (сайдбар прячется в выдвижное меню, сетки — в одну колонку). */
export const MOBILE_MAX = 820;

/** Подписка на media-query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Мобильная раскладка (телефон и узкий планшет). */
export const useIsMobile = () => useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);

/** Минимальная цель нажатия на мобильном (ТЗ, п. 6). */
export const TAP = 44;
