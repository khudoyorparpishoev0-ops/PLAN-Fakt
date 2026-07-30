import { useState } from 'react';
import { ACC, SOFT, PLEX } from '../theme';
import type { GenList, ArtRow } from '../data/admin';
import type { ApiDictionaries } from '../lib/api';
import { initials } from '../lib/compute';
import { AccentBtn } from '../components/ui';

const ART_TABS = ['Доходы', 'Расходы', 'Активы', 'Обязательства', 'Капитал'];

/** Тип статьи в БД → вкладка экрана. */
const TAB_TYPE: Record<string, keyof ApiDictionaries['articles']> = {
  'Доходы': 'income', 'Расходы': 'expense', 'Активы': 'asset',
  'Обязательства': 'liability', 'Капитал': 'equity',
};

export interface SpravScreenProps {
  /** Справочники из API; null — ещё грузятся. */
  dicts: ApiDictionaries | null;
}

interface ArtRowVM {
  key: string; padL: string; bg: string; fw: number; nameFg: string; name: string;
  hasToggle: boolean; sign: string; locked: boolean; toggle: () => void;
}

const DOTS = (
  <div className="hv-chip" style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A6ACA8', flex: 'none' }}>
    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="7" cy="11.5" r="1.2" /></svg>
  </div>
);

export default function SpravScreen({ dicts }: SpravScreenProps) {
  const [spravTab, setSpravTab] = useState('art');
  const [artTab, setArtTab] = useState('Расходы');
  const [artExp, setArtExp] = useState<Record<string, boolean>>({});

  /* Формы данных прототипа (ART / GEN) собираются из ответа API */
  const ART: Record<string, ArtRow[]> = {};
  for (const tab of ART_TABS) {
    ART[tab] = (dicts?.articles[TAB_TYPE[tab]] ?? []).map((a) => [a.name, a.children.map((c) => c.name), a.isSystem]);
  }
  const GEN: Record<string, GenList> = {
    contragents: { title: 'Контрагенты', add: 'Контрагент', rows: (dicts?.counterparties ?? []).map((r) => [r.name, r.note]) },
    accounts: { title: 'Мои счета', add: 'Счёт', rows: (dicts?.accounts ?? []).map((r) => [r.name, r.note]) },
    entities: { title: 'Мои юрлица', add: 'Юрлицо', rows: (dicts?.entities ?? []).map((r) => [r.name, r.note]) },
    goods: { title: 'Товары', add: 'Товар', rows: (dicts?.goods ?? []).map((r) => [r.name, r.note]) },
    services: { title: 'Услуги', add: 'Услугу', rows: (dicts?.services ?? []).map((r) => [r.name, r.note]) },
  };

  const artCount = Object.values(ART).reduce((a, arr) => a + arr.length, 0);

  const artRows: ArtRowVM[] = [];
  (ART[artTab] || []).forEach((it, i) => {
    const [name, kids, locked] = it, has = kids.length > 0, key = artTab + '|' + i, open = !!artExp[key];
    artRows.push({
      key, padL: '14px', bg: 'transparent', fw: 500, nameFg: '#1B1F1E', name, hasToggle: has,
      sign: open ? '−' : '+', locked,
      toggle: () => setArtExp(st => ({ ...st, [key]: !st[key] })),
    });
    if (has && open) kids.forEach((k, j) => artRows.push({
      key: key + '|k' + j, padL: '34px', bg: '#FBFAF8', fw: 400, nameFg: '#5A625E', name: k,
      hasToggle: false, sign: '', locked: false, toggle: () => {},
    }));
  });

  const spravNav: [string, string, string][] = [
    ['contragents', 'Контрагенты', String(GEN.contragents.rows.length)],
    ['art', 'Учётные статьи', String(artCount)],
    ['accounts', 'Мои счета', String(GEN.accounts.rows.length)],
    ['entities', 'Мои юрлица', String(GEN.entities.rows.length)],
  ];
  const spravNav2: [string, string, string][] = [
    ['goods', 'Товары', String(GEN.goods.rows.length)],
    ['services', 'Услуги', String(GEN.services.rows.length)],
  ];

  const navItem = ([id, t, n]: [string, string, string]) => {
    const on = spravTab === id;
    return (
      <div key={id} onClick={() => setSpravTab(id)} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400, color: on ? ACC : '#3E4643', background: on ? SOFT : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{t}</span><span style={{ fontSize: 11, color: '#A6ACA8', fontFamily: PLEX }}>{n}</span>
      </div>
    );
  };

  const genList = GEN[spravTab] as GenList | undefined;
  const genRows = genList ? genList.rows.map(r => ({ p: r[0], sec: r[1], init: initials(r[0]) })) : [];

  return (
    <div data-screen-label="Справочники" style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', padding: '8px 10px 6px' }}>СПРАВОЧНИКИ</div>
        {spravNav.map(navItem)}
        <div style={{ height: 1, background: '#EFEEE9', margin: '6px 8px' }} />
        {spravNav2.map(navItem)}
      </div>
      <div style={{ minWidth: 0 }}>
        {spravTab === 'art' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Учётные статьи</div>
              <div title="Единый план статей: доходы, расходы, активы, обязательства, капитал" style={{ width: 16, height: 16, borderRadius: '50%', border: '1.3px solid #C6CBC7', color: '#A6ACA8', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>?</div>
              <div style={{ flex: 1 }} />
              <AccentBtn style={{ padding: '8px 15px' }}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Статья</AccentBtn>
            </div>
            <div style={{ display: 'inline-flex', background: '#EBEAE4', padding: 3, borderRadius: 9, gap: 2, marginBottom: 14 }}>
              {ART_TABS.map(t => {
                const on = artTab === t;
                return (
                  <div key={t} onClick={() => setArtTab(t)} style={{ padding: '6px 16px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: on ? 600 : 500, color: on ? '#1B1F1E' : '#6B7370', background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{t}</div>
                );
              })}
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
              {artRows.map(r => (
                <div key={r.key} className="hv-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', paddingLeft: r.padL, borderBottom: '1px solid #F3F2ED', background: r.bg }}>
                  {r.hasToggle ? (
                    <div onClick={r.toggle} style={{ width: 20, height: 20, border: '1px solid #DAD7D0', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370', flex: 'none', fontSize: 14, lineHeight: 1 }}>{r.sign}</div>
                  ) : (
                    <div style={{ width: 20, flex: 'none' }} />
                  )}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: r.fw, color: r.nameFg }}>{r.name}</span>
                  {r.locked && (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#B0B5B1" strokeWidth="1.4" style={{ flex: 'none' }}><rect x="2.5" y="6" width="9" height="6.3" rx="1.3" /><path d="M4.5 6V4.3A2.5 2.5 0 019.5 4.3V6" /></svg>
                  )}
                  {DOTS}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#8A918D', marginTop: 10, lineHeight: 1.5 }}>«+» раскрывает подстатьи. Статьи с замком — системные, их нельзя удалить. Статьи используются в формах доходов и расходов и в отчёте «План–Факт».</div>
          </div>
        )}
        {spravTab !== 'art' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{genList ? genList.title : ''}</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#66706C', background: '#EFEEEA', borderRadius: 99, padding: '2px 9px', fontFamily: PLEX }}>{genList ? String(genList.rows.length) : '0'}</span>
              <div style={{ flex: 1 }} />
              <input placeholder="Поиск" style={{ height: 34, width: 200, border: '1px solid #E0DED8', borderRadius: 8, padding: '0 12px', fontSize: 12.5, background: '#fff', outline: 'none' }} />
              <AccentBtn style={{ padding: '8px 15px' }}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> {genList ? genList.add : ''}</AccentBtn>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
              {genRows.map((r, i) => (
                <div key={i} className="hv-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid #F3F2ED' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flex: 'none' }}>{r.init}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.p}</div>
                    <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>{r.sec}</div>
                  </div>
                  {DOTS}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
