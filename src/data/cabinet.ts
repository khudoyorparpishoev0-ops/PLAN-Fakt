/** Fixture-данные кабинета операционного бухгалтера.
 *  Визуальный эталон — «Кабинет Бухгалтера.dc.html»; данные-примеры расширены
 *  относительно прототипа и согласованы с проектами админ-панели. */
import type { BadgeData } from '../lib/badges';
import { C } from '../theme';

/** Сквозной статус заявки: Черновик → Отправлено → На рассмотрении → Одобрено / Отклонено. */
export type ReqStatus = 'Черновик' | 'Отправлено' | 'На рассмотрении' | 'Одобрено' | 'Отклонено';
export type ReqKind = 'payment' | 'trip' | 'auto';

/** Статус-бейджи кабинета. Раньше здесь была своя палитра — ранний прототип
 *  кабинета рисовался отдельно от админ-панели, и синий с жёлтым в нём были
 *  свои. Теперь оба кабинета берут одни и те же пять состояний из токенов:
 *  цвет несёт смысл, и один и тот же статус не должен выглядеть по-разному
 *  на соседних экранах. */
export const CB = {
  draft: { t: 'Черновик', ...C.gray },
  sent: { t: 'Отправлено', ...C.blue },
  pending: { t: 'На рассмотрении', ...C.yellow },
  approved: { t: 'Одобрено', ...C.green },
  rejected: { t: 'Отклонено', ...C.red },
} as const;

/** Бейдж статуса проекта — общий для кабинета и админ-панели.
 *  Раскладка из дизайн-системы: «Плановый» нейтральный, «В работе» акцентный,
 *  «Завершён» зелёный. До перехода на токены обе половины приложения красили
 *  эти три статуса по-своему и по-разному. */
export function cabProjB(status: 'plan' | 'work' | 'done'): BadgeData {
  if (status === 'work') return { t: 'В работе', ...C.blue };
  if (status === 'plan') return { t: 'Плановый', ...C.gray };
  return { t: 'Завершён', ...C.green };
}

/** dbId — первичный ключ заявки в БД (нужен для вызовов API); attId — id
 *  вложения (открытие файла); storno — заявка сторнирована директором.
 *  У fixture-строк (используются только сидом БД) эти поля отсутствуют. */
export interface PayReq {
  id: string; dbId?: number; attId?: number; storno?: boolean; projectId?: number;
  date: string; project: string; name: string; amount: number;
  currency: string; status: ReqStatus; doc?: string;
}
export interface TripReq {
  id: string; dbId?: number; attId?: number; storno?: boolean; projectId?: number;
  date: string; project: string; goal: string; km: number;
  contragent: string; status: ReqStatus; photo: string;
}
export type CarCategory = 'Бензин' | 'Ремонт' | 'Мойка' | 'Штраф' | 'Запчасти';
export interface CarReq {
  id: string; dbId?: number; attId?: number; storno?: boolean; projectId?: number;
  date: string; project: string; category: CarCategory; amount: number;
  currency: string; status: ReqStatus; receipt?: string;
}

/** Бейдж собственного статуса заявки (колонка «Статус»): черновик / на рассмотрении /
 *  отправлено — как в строках PAY прототипа (own остаётся «Отправлено» и после решения). */
export function ownB(st: ReqStatus): BadgeData {
  if (st === 'Черновик') return CB.draft;
  if (st === 'На рассмотрении') return CB.pending;
  return CB.sent;
}
/** Бейдж решения директора (колонка «Директор»).
 *  storno — одобренная заявка сторнирована (ТЗ, п. 5). */
export function dirB(st: ReqStatus, storno?: boolean): BadgeData {
  if (storno) return { ...CB.draft, t: 'Сторнировано' };
  switch (st) {
    case 'Черновик': return { ...CB.draft, t: '—' };
    case 'Отправлено': return { ...CB.draft, t: 'Ожидает' };
    case 'На рассмотрении': return CB.pending;
    case 'Одобрено': return CB.approved;
    case 'Отклонено': return CB.rejected;
  }
}

export const PAY: PayReq[] = [
  { id: 'З-118', date: '28.10.2026', project: 'Насосная станция Вахдат', name: 'Оплата хостинга за октябрь', amount: 1200, currency: 'TJS', status: 'Отправлено', doc: 'Счёт №214.pdf' },
  { id: 'З-117', date: '27.10.2026', project: 'ГЭС Помир-1', name: 'Крепёж и анкеры для монтажного щита', amount: 3450, currency: 'TJS', status: 'На рассмотрении', doc: 'Счёт №209.pdf' },
  { id: 'З-116', date: '25.10.2026', project: 'Сервис Душанбе', name: 'Картриджи для офисного МФУ', amount: 640, currency: 'TJS', status: 'Одобрено' },
  { id: 'З-115', date: '24.10.2026', project: 'Насосная станция Вахдат', name: 'Кабель ВВГ 3×2,5 — 120 м', amount: 8900, currency: 'TJS', status: 'Одобрено', doc: 'Накладная.jpg' },
  { id: 'З-114', date: '22.10.2026', project: 'ГЭС Помир-1', name: 'Суточные бригады №2 (5 дней)', amount: 4500, currency: 'TJS', status: 'Отклонено' },
  { id: 'З-113', date: '20.10.2026', project: 'Сервис Душанбе', name: 'Заправка картриджа и ремонт МФУ', amount: 260, currency: 'TJS', status: 'Одобрено' },
  { id: 'З-112', date: '18.10.2026', project: 'Насосная станция Вахдат', name: 'Метизы и хомуты для трубопровода', amount: 1780, currency: 'TJS', status: 'Одобрено', doc: 'Счёт №198.pdf' },
  { id: 'З-111', date: '15.10.2026', project: 'Без проекта', name: 'Канцтовары для офиса', amount: 320, currency: 'TJS', status: 'Одобрено' },
  { id: 'З-110', date: '14.10.2026', project: 'ГЭС Помир-1', name: 'Аренда генератора на объект (3 сут.)', amount: 2700, currency: 'TJS', status: 'Одобрено', doc: 'Договор аренды.pdf' },
  { id: 'З-109', date: '12.10.2026', project: 'Насосная станция Вахдат', name: 'Спецодежда для бригады', amount: 5400, currency: 'TJS', status: 'Черновик' },
];

export const TRIPS: TripReq[] = [
  { id: 'П-054', date: '27.10.2026', project: 'Насосная станция Вахдат', goal: 'Доставка креплений на объект', km: 96, contragent: '«ТаджТехСнаб»', status: 'На рассмотрении', photo: 'одометр_2710.jpg' },
  { id: 'П-053', date: '24.10.2026', project: 'ГЭС Помир-1', goal: 'Выезд на приёмку щитовой', km: 210, contragent: '«Помир Энерго»', status: 'Одобрено', photo: 'одометр_2410.jpg' },
  { id: 'П-052', date: '21.10.2026', project: 'Сервис Душанбе', goal: 'Плановое ТО серверной', km: 18, contragent: 'ООО «Сомон Сервис»', status: 'Одобрено', photo: 'одометр_2110.jpg' },
  { id: 'П-051', date: '17.10.2026', project: 'Насосная станция Вахдат', goal: 'Закупка расходников на базаре', km: 34, contragent: 'Базар Регар', status: 'Одобрено', photo: 'одометр_1710.jpg' },
  { id: 'П-050', date: '15.10.2026', project: 'ГЭС Помир-1', goal: 'Перевозка бригады №2', km: 208, contragent: '—', status: 'Отклонено', photo: 'одометр_1510.jpg' },
  { id: 'П-049', date: '12.10.2026', project: 'Насосная станция Вахдат', goal: 'Осмотр площадки под насосную', km: 88, contragent: 'ОАО «Обу корез»', status: 'Одобрено', photo: 'одометр_1210.jpg' },
];

export const CARS: CarReq[] = [
  { id: 'А-031', date: '28.10.2026', project: 'Насосная станция Вахдат', category: 'Бензин', amount: 420, currency: 'TJS', status: 'Отправлено', receipt: 'чек_2810.jpg' },
  { id: 'А-030', date: '26.10.2026', project: 'ГЭС Помир-1', category: 'Бензин', amount: 560, currency: 'TJS', status: 'На рассмотрении', receipt: 'чек_2610.jpg' },
  { id: 'А-029', date: '23.10.2026', project: 'Сервис Душанбе', category: 'Мойка', amount: 60, currency: 'TJS', status: 'Одобрено' },
  { id: 'А-028', date: '20.10.2026', project: 'Насосная станция Вахдат', category: 'Ремонт', amount: 1850, currency: 'TJS', status: 'Одобрено', receipt: 'чек_2010.jpg' },
  { id: 'А-027', date: '16.10.2026', project: 'ГЭС Помир-1', category: 'Штраф', amount: 190, currency: 'TJS', status: 'Отклонено', receipt: 'чек_1610.jpg' },
  { id: 'А-026', date: '13.10.2026', project: 'Насосная станция Вахдат', category: 'Запчасти', amount: 740, currency: 'TJS', status: 'Одобрено', receipt: 'чек_1310.jpg' },
];

/* Ставка компенсации поездок — в настройках БД (settings.km_rate, GET /api/settings).
 * С ШАГА 3 экраны кабинета работают на данных API: массивы PAY/TRIPS/CARS выше
 * используются только сидом БД (server/prisma/seed.ts); «Статистика по месяцам»
 * и списки проектов считаются из ответов API (src/lib/mapping.ts). */
