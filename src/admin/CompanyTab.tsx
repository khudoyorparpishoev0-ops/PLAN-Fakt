import { useEffect, useState, type CSSProperties } from 'react';
import { ACC, applyThemeVars, type Density } from '../theme';
import { BASE_CURRENCY } from '../lib/currency';

/** Плотность хранится на пользователя — бухгалтер за 27-дюймовым монитором
 *  и директор с ноутбука хотят разного. Ключ локальный: серверного профиля
 *  оформления в ТЗ нет, заводить его ради одного переключателя незачем. */
const DENSITY_KEY = 'ithona.density';

export function savedDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'Компактная' : 'Комфортная';
}

/** Сохранить и применить плотность (общая точка для «Компании» и отчёта). */
export function saveDensity(d: Density) {
  localStorage.setItem(DENSITY_KEY, d === 'Компактная' ? 'compact' : 'comfort');
  applyThemeVars(undefined, d);
}

const cardS: CSSProperties = {
  background: 'var(--fin-surface)', border: '1px solid var(--fin-border)',
  borderRadius: 12, padding: '20px 22px', maxWidth: 620,
};
const secHead: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em',
  color: 'var(--fin-text-5)', marginBottom: 10,
};
const rowS: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'baseline',
  padding: '9px 0', borderBottom: '1px solid var(--fin-divider)',
};

/** Вкладка «Компания»: профиль организации и плотность интерфейса. */
export default function CompanyTab() {
  const [density, setDensity] = useState<Density>(savedDensity);

  useEffect(() => { saveDensity(density); }, [density]);

  const profile: [string, string][] = [
    ['Название', 'IT-HONA LLC'],
    ['Юрлицо в отчётах', 'IT-HONA LLC'],
    ['Города', 'Душанбе, Худжанд'],
    ['Валюта учёта', `${BASE_CURRENCY} — сомони`],
    ['Часовой пояс', 'Asia/Dushanbe (UTC+5)'],
    ['Язык интерфейса', 'Русский'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardS}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Профиль компании</div>
        <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', marginBottom: 16 }}>
          Подставляется в шапку разделов и в лист «Параметры» выгрузок Excel.
        </div>
        {profile.map(([k, v]) => (
          <div key={k} style={rowS}>
            <span style={{ flex: '0 0 170px', fontSize: 12.5, color: 'var(--fin-text-4)' }}>{k}</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={cardS}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Плотность интерфейса</div>
        <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', marginBottom: 16, lineHeight: 1.6 }}>
          Переключается по-настоящему: меняются высота строки, поля ячеек, высота
          контролов и размеры шрифта — весь набор из токенов, а не пара отступов.
          На 10 000 операций компактный режим экономит экран.
        </div>
        <div style={secHead}>РЕЖИМ</div>
        <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2 }}>
          {(['Комфортная', 'Компактная'] as Density[]).map((d) => {
            const on = d === density;
            return (
              <button
                key={d} type="button" data-density={d} onClick={() => setDensity(d)}
                style={{
                  padding: '7px 16px', border: 'none', cursor: 'pointer', borderRadius: 7,
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 600 : 500,
                  background: on ? 'var(--fin-surface)' : 'transparent',
                  color: on ? 'var(--fin-text)' : 'var(--fin-text-3)',
                  boxShadow: on ? 'var(--fin-shadow-seg)' : 'none',
                }}
              >{d}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10 }}>
          {density === 'Компактная'
            ? 'Строка 36px, текст 12.5px — больше данных в экране'
            : 'Строка 44px, текст 14px — читается с расстояния'}
        </div>

        {/* Живой пример: перестраивается вместе с переключателем */}
        <div style={{ marginTop: 16, border: '1px solid var(--fin-border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Дата', 'Контрагент', 'Сумма'].map((h, i) => (
                <th key={h} style={{
                  padding: 'var(--fin-cell-pad)', fontSize: 'var(--fin-fs-head)', fontWeight: 600,
                  letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--fin-text-4)',
                  background: 'var(--fin-surface-alt)', borderBottom: '1px solid var(--fin-border)',
                  textAlign: i === 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[['12.10.2026', 'ООО «Барака»', '−14 000,00'], ['11.10.2026', 'ЗАО «Тоҷиктелеком»', '−3 850,00']].map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => (
                    <td key={i} style={{
                      padding: 'var(--fin-cell-pad)', height: 'var(--fin-row-h)',
                      fontSize: 'var(--fin-fs-table)', borderBottom: '1px solid var(--fin-divider)',
                      textAlign: i === 2 ? 'right' : 'left',
                      fontFamily: i === 0 || i === 2 ? "'IBM Plex Sans',sans-serif" : undefined,
                      fontVariantNumeric: i === 2 ? 'tabular-nums' : undefined,
                      color: i === 2 ? 'var(--fin-minus)' : undefined,
                      fontWeight: i === 2 ? 600 : undefined,
                    }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: ACC, marginTop: 10 }}>
          Настройка запоминается на этом устройстве.
        </div>
      </div>
    </div>
  );
}
