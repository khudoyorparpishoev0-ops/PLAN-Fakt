/** Настройки модуля. Источник истины — таблица settings в БД
 *  (GET /api/settings); значение загружается после входа (setKmRate).
 *
 *  kmRate — ставка компенсации поездок, сомони за километр.
 *  По умолчанию 0 = ставка не задана: суммы по поездкам НЕ считаются,
 *  интерфейс показывает километры вместо денег (решение заказчика, 30.07.2026). */
export const SETTINGS = {
  kmRate: 0,
};

/** Применить ставку, загруженную с сервера. */
export const setKmRate = (v: number) => { SETTINGS.kmRate = v; };

/** Ставка компенсации задана? */
export const kmRateSet = (): boolean => SETTINGS.kmRate > 0;

/** Денежная оценка поездки; 0, пока ставка не задана. */
export const tripAmount = (km: number): number => km * SETTINGS.kmRate;
