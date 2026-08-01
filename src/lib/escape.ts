import { useEffect, useRef } from 'react';

/** Стек открытых слоёв: Escape закрывает только верхний.
 *  Без него превью поверх карточки операции закрывало бы оба слоя разом. */
const stack: { fn: () => void }[] = [];

let bound = false;
function ensureBinding() {
  if (bound) return;
  bound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || stack.length === 0) return;
    stack[stack.length - 1].fn();
  });
}

/** Закрытие шторки или модалки клавишей Escape.
 *  На узких экранах подложка почти не видна, и тапнуть мимо панели негде —
 *  клавиатурный выход остаётся единственным быстрым способом (плюс это
 *  привычное поведение диалогов). */
export function useEscapeClose(onClose: () => void, active = true) {
  // Колбэк держим в ref: слой встаёт в стек один раз при открытии, и
  // перерисовка родителя не меняет порядок слоёв
  const ref = useRef(onClose);
  ref.current = onClose;

  useEffect(() => {
    if (!active) return;
    ensureBinding();
    const entry = { fn: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
