import type { CSSProperties } from 'react';
import { ROLE_LABELS, type RoleCode } from '../lib/api';

/** Как право отражено в системе. */
type Mark = 'yes' | 'no' | 'part';

interface Right {
  label: string;
  /** Откуда правило: пункт ТЗ, решение заказчика или пометка «в ТЗ нет». */
  src: string;
  cells: Record<RoleCode, Mark>;
  /** Правило не описано в ТЗ — решение принято при разработке.
   *  Сейчас таких строк нет: последнюю закрыл заказчик 01.08.2026. */
  open?: boolean;
}

const y: Mark = 'yes', n: Mark = 'no', p: Mark = 'part';
const row = (admin: Mark, director: Mark, accountant: Mark) => ({ admin, director, accountant });

/** Матрица прав. Строки собраны не из ТЗ, а из того, что реально проверяет
 *  сервер: у каждого маршрута стоит @Roles(...), и таблица его повторяет.
 *  Отдельной сущности «право» в системе нет — права зашиты в роль, поэтому
 *  таблица только для чтения: редактируемые галочки создали бы состояния,
 *  которых бэкенд не знает. */
const RIGHTS: Right[] = [
  { label: 'План-Факт, показатели, журнал операций', src: 'ТЗ 2, 3.1–3.2', cells: row(y, y, n) },
  { label: 'Проекты: список и карточка', src: 'ТЗ 2, 3.3', cells: row(y, y, p) },
  { label: 'Справочники: создание и правка', src: 'ТЗ 2, 3.4', cells: row(y, y, n) },
  { label: 'Закупки, склад, клиенты, задачи', src: 'этап 2', cells: row(y, y, n) },
  { label: 'Выгрузка в Excel (сводная)', src: 'ТЗ 9 · решение 07 — бухгалтер может выгружать всё', cells: row(y, y, y) },
  { label: 'Выгрузки по расписанию', src: 'ТЗ 11', cells: row(y, y, n) },
  { label: 'Утверждение и отклонение заявок', src: 'ТЗ 2, 5 — решает только директор', cells: row(n, y, n) },
  { label: 'Сторнирование одобренной заявки', src: 'ТЗ 5 — решает только директор', cells: row(n, y, n) },
  { label: 'Создание заявок на оплату, поездку, авто', src: 'ТЗ 4.1–4.3', cells: row(n, n, y) },
  { label: 'Свои заявки и своя история', src: 'ТЗ 2, 4.4', cells: row(n, n, y) },
  { label: 'Пользователи и учётные записи', src: 'ТЗ 2, 3.5', cells: row(y, n, n) },
  { label: 'Настройки компании и ставка километража', src: 'ТЗ 3.5', cells: row(y, n, n) },
  { label: 'История действий (аудит-лог)', src: 'ТЗ 10', cells: row(y, n, n) },
];

const MARK: Record<Mark, { text: string; fg: string; bg: string }> = {
  yes: { text: '✓', fg: 'var(--fin-plus)', bg: 'var(--fin-plus-soft)' },
  no: { text: '—', fg: 'var(--fin-text-5)', bg: 'transparent' },
  part: { text: 'частично', fg: 'var(--fin-accent)', bg: 'var(--fin-accent-soft)' },
};

const ROLES: RoleCode[] = ['admin', 'director', 'accountant'];

const th: CSSProperties = {
  padding: 'var(--row-pad)', fontSize: 'var(--fin-fs-head)', fontWeight: 600,
  letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--fin-text-4)',
  background: 'var(--fin-surface-alt)', borderBottom: '1px solid var(--fin-border)',
  textAlign: 'left',
};
const td: CSSProperties = { padding: 'var(--row-pad)', borderBottom: '1px solid var(--fin-divider)' };

/** Вкладка «Права» — матрица «роль × действие», только для чтения. */
export default function RightsMatrix() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      <div style={{ fontSize: 12.5, color: 'var(--fin-text-2)', lineHeight: 1.6 }}>
        Права зашиты в роль — отдельной сущности «право» в системе нет, поэтому таблица
        только для чтения. Строки повторяют то, что проверяет сервер: чужая роль получает
        403, а не пустой экран.
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table data-rights style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Действие</th>
              {ROLES.map((r) => (
                <th key={r} style={{ ...th, textAlign: 'center', width: 150 }}>{ROLE_LABELS[r]}</th>
              ))}
            </tr></thead>
            <tbody>
              {RIGHTS.map((right) => (
                <tr key={right.label}>
                  <td style={td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 'var(--fin-fs-table)', fontWeight: 500 }}>
                        {right.label}
                        {right.open && (
                          <span title="В ТЗ не описано — решение принято при разработке" style={{ marginLeft: 6, color: 'var(--fin-warn)', fontWeight: 700 }}>?</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{right.src}</span>
                    </div>
                  </td>
                  {ROLES.map((role) => {
                    const m = MARK[right.cells[role]];
                    return (
                      <td key={role} style={{ ...td, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 26, height: 22, padding: '0 8px', borderRadius: 99,
                          fontSize: right.cells[role] === 'part' ? 11 : 13, fontWeight: 600,
                          color: m.fg, background: m.bg,
                        }}>{m.text}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'var(--fin-text-4)' }}>
        <span><b style={{ color: 'var(--fin-plus)' }}>✓</b> право есть</span>
        <span><b style={{ color: 'var(--fin-text-5)' }}>—</b> права нет</span>
        <span><b style={{ color: 'var(--fin-accent)' }}>частично</b> бухгалтер видит только суммы своих заявок</span>
        <span><b style={{ color: 'var(--fin-warn)' }}>?</b> в ТЗ не описано</span>
      </div>

      <div style={{ background: 'var(--fin-surface-alt)', borderRadius: 10, padding: '11px 14px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--fin-text-2)' }}>
        <b>Роль администратора — наблюдение и доступы.</b> Он видит все разделы, заводит
        пользователей и раздаёт права, но решения по заявкам принимает только директор
        (решение заказчика). Очередь согласования администратору показывается без кнопок:
        сервер и так вернёт 403, но кнопка обещать не должна.
      </div>
    </div>
  );
}
