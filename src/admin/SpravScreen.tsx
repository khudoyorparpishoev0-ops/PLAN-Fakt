import { useState, type CSSProperties } from 'react';
import { ACC, SOFT, PLEX } from '../theme';
import type { GenList, ArtRow } from '../data/admin';
import { api, ApiError, type ApiDictionaries, type RefKind } from '../lib/api';
import { initials } from '../lib/compute';
import { AccentBtn } from '../components/ui';
import { useIsMobile } from '../lib/responsive';

const ART_TABS = ['Доходы', 'Расходы', 'Активы', 'Обязательства', 'Капитал'];

/** Тип статьи в БД → вкладка экрана. */
const TAB_TYPE: Record<string, keyof ApiDictionaries['articles']> = {
  'Доходы': 'income', 'Расходы': 'expense', 'Активы': 'asset',
  'Обязательства': 'liability', 'Капитал': 'equity',
};

export interface SpravScreenProps {
  /** Справочники из API; null — ещё грузятся. */
  dicts: ApiDictionaries | null;
  /** Перечитать справочники после изменения. */
  onChanged: () => void;
}

/** Вкладка экрана → вид справочника в API. */
const REF_BY_TAB: Record<string, RefKind> = {
  contragents: 'counterparty', accounts: 'account', entities: 'entity', goods: 'good', services: 'service',
};

const inpS: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
const lblS: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };

/** Модалка ввода/правки записи справочника или статьи. */
function RefModal({ title, initial, withNote, withKind, onClose, onSubmit }: {
  title: string;
  initial: { name: string; note: string; kind?: 'cash' | 'bank' };
  withNote: boolean;
  withKind?: boolean;
  onClose: () => void;
  onSubmit: (v: { name: string; note?: string; kind?: 'cash' | 'bank' }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [note, setNote] = useState(initial.note);
  const [kind, setKind] = useState<'cash' | 'bank'>(initial.kind ?? 'bank');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2 && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), ...(withNote ? { note } : {}), ...(withKind ? { kind } : {}) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 420, maxWidth: '94vw', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px', animation: 'finFade .18s ease' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{title}</div>
        <div style={{ marginBottom: 12 }}>
          <div style={lblS}>Название</div>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus style={inpS} />
        </div>
        {withNote && (
          <div style={{ marginBottom: 12 }}>
            <div style={lblS}>Примечание</div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Реквизиты, единицы, комментарий" style={inpS} />
          </div>
        )}
        {withKind && (
          <div style={{ marginBottom: 12 }}>
            <div style={lblS}>Вид счёта</div>
            <select value={kind} onChange={e => setKind(e.target.value as 'cash' | 'bank')} style={{ ...inpS, padding: '0 8px' }}>
              <option value="bank">Расчётный счёт (банк)</option>
              <option value="cash">Касса (наличные)</option>
            </select>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: 'var(--fin-minus)', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отмена</div>
          <div onClick={valid ? submit : undefined} className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ArtRowVM {
  key: string; id: number; parentId?: number;
  padL: string; bg: string; fw: number; nameFg: string; name: string;
  hasToggle: boolean; sign: string; locked: boolean; toggle: () => void;
}

/** Меню строки справочника: правка и удаление. */
function RowMenu({ onEdit, onDelete, disabled }: { onEdit: () => void; onDelete: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />}
      <div
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="hv-chip"
        style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-5)' }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="7" cy="11.5" r="1.2" /></svg>
      </div>
      {open && (
        <div style={{ position: 'absolute', right: 26, top: 0, zIndex: 40, background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,.14)', padding: 5, minWidth: 160 }}>
          <div onClick={() => { setOpen(false); onEdit(); }} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Переименовать</div>
          <div
            onClick={disabled ? undefined : () => { setOpen(false); onDelete(); }}
            className={disabled ? undefined : 'hv-red'}
            title={disabled ? 'Системную запись удалить нельзя' : undefined}
            style={{ padding: '8px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--fin-minus)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }}
          >
            Удалить
          </div>
        </div>
      )}
    </div>
  );
}

const DOTS = (
  <div className="hv-chip" style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-5)', flex: 'none' }}>
    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="7" cy="11.5" r="1.2" /></svg>
  </div>
);

export default function SpravScreen({ dicts, onChanged }: SpravScreenProps) {
  const isMobile = useIsMobile();
  const [spravTab, setSpravTab] = useState('art');
  const [artTab, setArtTab] = useState('Расходы');
  const [artExp, setArtExp] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  /** Открытая форма: создание или правка записи. */
  const [modal, setModal] = useState<
    | { mode: 'create'; kind: RefKind; title: string; parentId?: number; type?: string }
    | { mode: 'edit'; kind: RefKind; title: string; id: number; name: string; note: string }
    | null
  >(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      onChanged();
      setNotice(ok);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Не удалось выполнить действие');
      throw e;
    }
  };

  const removeRef = (kind: RefKind, id: number, name: string) => {
    if (!window.confirm(`Удалить «${name}»?`)) return;
    run(() => api.removeRef(kind, id), `«${name}» удалено`).catch(() => {});
  };

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

  /* ── Строки дерева статей: у каждой есть id для правки и удаления ── */
  const artSource = dicts?.articles[TAB_TYPE[artTab]] ?? [];
  const artRows: ArtRowVM[] = [];
  artSource.forEach((a, i) => {
    const key = artTab + '|' + i, open = !!artExp[key], has = a.children.length > 0;
    artRows.push({
      key, id: a.id, padL: '14px', bg: 'transparent', fw: 500, nameFg: 'var(--fin-text)', name: a.name,
      hasToggle: has, sign: open ? '−' : '+', locked: a.isSystem,
      toggle: () => setArtExp(st => ({ ...st, [key]: !st[key] })),
    });
    if (has && open) a.children.forEach((c, j) => artRows.push({
      key: key + '|k' + j, id: c.id, padL: '34px', bg: 'var(--fin-surface-alt)', fw: 400, nameFg: 'var(--fin-text-2)', name: c.name,
      hasToggle: false, sign: '', locked: false, toggle: () => {}, parentId: a.id,
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
      <div key={id} onClick={() => setSpravTab(id)} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400, color: on ? ACC : 'var(--fin-text-2)', background: on ? SOFT : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{t}</span><span style={{ fontSize: 11, color: 'var(--fin-text-5)', fontFamily: PLEX }}>{n}</span>
      </div>
    );
  };

  const genList = GEN[spravTab] as GenList | undefined;
  /** id записей идут в том же порядке, что и строки GEN (собраны из dicts). */
  const genIds: number[] =
    spravTab === 'contragents' ? (dicts?.counterparties ?? []).map(r => r.id)
    : spravTab === 'accounts' ? (dicts?.accounts ?? []).map(r => r.id)
    : spravTab === 'entities' ? (dicts?.entities ?? []).map(r => r.id)
    : spravTab === 'goods' ? (dicts?.goods ?? []).map(r => r.id)
    : spravTab === 'services' ? (dicts?.services ?? []).map(r => r.id)
    : [];
  const q = search.trim().toLowerCase();
  const genRows = (genList ? genList.rows.map((r, i) => ({ id: genIds[i] ?? i, p: r[0], sec: r[1], init: initials(r[0]) })) : [])
    .filter(r => !q || r.p.toLowerCase().includes(q) || r.sec.toLowerCase().includes(q));

  return (
    <div data-screen-label="Справочники" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '230px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: 'var(--fin-text-5)', padding: '8px 10px 6px' }}>СПРАВОЧНИКИ</div>
        {spravNav.map(navItem)}
        <div style={{ height: 1, background: 'var(--fin-divider)', margin: '6px 8px' }} />
        {spravNav2.map(navItem)}
      </div>
      <div style={{ minWidth: 0 }}>
        {spravTab === 'art' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Учётные статьи</div>
              <div title="Единый план статей: доходы, расходы, активы, обязательства, капитал" style={{ width: 16, height: 16, borderRadius: '50%', border: '1.3px solid var(--fin-border)', color: 'var(--fin-text-5)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>?</div>
              <div style={{ flex: 1 }} />
              <AccentBtn
                style={{ padding: '8px 15px' }}
                onClick={() => setModal({ mode: 'create', kind: 'article', title: `Новая статья · ${artTab}`, type: TAB_TYPE[artTab] })}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Статья
              </AccentBtn>
            </div>
            <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2, marginBottom: 14 }}>
              {ART_TABS.map(t => {
                const on = artTab === t;
                return (
                  <div key={t} onClick={() => setArtTab(t)} style={{ padding: '6px 16px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: on ? 600 : 500, color: on ? 'var(--fin-text)' : 'var(--fin-text-3)', background: on ? 'var(--fin-surface)' : 'transparent', boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{t}</div>
                );
              })}
            </div>
            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
              {artRows.map(r => (
                <div key={r.key} className="hv-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', paddingLeft: r.padL, borderBottom: '1px solid var(--fin-divider)', background: r.bg }}>
                  {r.hasToggle ? (
                    <div onClick={r.toggle} style={{ width: 20, height: 20, border: '1px solid var(--fin-border)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)', flex: 'none', fontSize: 14, lineHeight: 1 }}>{r.sign}</div>
                  ) : (
                    <div style={{ width: 20, flex: 'none' }} />
                  )}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: r.fw, color: r.nameFg }}>{r.name}</span>
                  {r.locked && (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--fin-text-5)" strokeWidth="1.4" style={{ flex: 'none' }}><rect x="2.5" y="6" width="9" height="6.3" rx="1.3" /><path d="M4.5 6V4.3A2.5 2.5 0 019.5 4.3V6" /></svg>
                  )}
                  {!r.parentId && (
                    <div
                      onClick={() => setModal({ mode: 'create', kind: 'article', title: `Подстатья к «${r.name}»`, type: TAB_TYPE[artTab], parentId: r.id })}
                      title="Добавить подстатью"
                      className="hv-chip"
                      style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-5)', fontSize: 15, lineHeight: 1, flex: 'none' }}
                    >
                      +
                    </div>
                  )}
                  <RowMenu
                    disabled={r.locked}
                    onEdit={() => setModal({ mode: 'edit', kind: 'article', title: 'Переименовать статью', id: r.id, name: r.name, note: '' })}
                    onDelete={() => removeRef('article', r.id, r.name)}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>«+» раскрывает подстатьи. Статьи с замком — системные, их нельзя удалить. Статьи используются в формах доходов и расходов и в отчёте «План–Факт».</div>
          </div>
        )}
        {spravTab !== 'art' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{genList ? genList.title : ''}</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fin-text-3)', background: 'var(--fin-divider)', borderRadius: 99, padding: '2px 9px', fontFamily: PLEX }}>{genList ? String(genList.rows.length) : '0'}</span>
              <div style={{ flex: 1 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск" style={{ height: 34, width: 200, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 12px', fontSize: 12.5, background: 'var(--fin-surface)', outline: 'none' }} />
              <AccentBtn
                style={{ padding: '8px 15px' }}
                onClick={() => setModal({ mode: 'create', kind: REF_BY_TAB[spravTab], title: `Новая запись · ${genList?.title ?? ''}` })}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> {genList ? genList.add : ''}
              </AccentBtn>
            </div>
            <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
              {genRows.map((r) => (
                <div key={r.id} className="hv-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid var(--fin-divider)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flex: 'none' }}>{r.init}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.p}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>{r.sec}</div>
                  </div>
                  <RowMenu
                    onEdit={() => setModal({ mode: 'edit', kind: REF_BY_TAB[spravTab], title: 'Изменить запись', id: r.id, name: r.p, note: r.sec })}
                    onDelete={() => removeRef(REF_BY_TAB[spravTab], r.id, r.p)}
                  />
                </div>
              ))}
              {genRows.length === 0 && (
                <div style={{ padding: '18px', textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-5)' }}>
                  {search ? 'Ничего не найдено' : 'Записей пока нет'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {modal && (
        <RefModal
          title={modal.title}
          withNote={modal.kind !== 'article'}
          withKind={modal.kind === 'account'}
          initial={modal.mode === 'edit' ? { name: modal.name, note: modal.note } : { name: '', note: '' }}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            if (modal.mode === 'create') {
              await run(
                () => api.createRef(modal.kind, {
                  ...v,
                  ...(modal.kind === 'article'
                    ? { type: modal.type as 'income' | 'expense' | 'asset' | 'liability' | 'equity', parentId: modal.parentId }
                    : {}),
                }),
                `«${v.name}» добавлено`,
              );
            } else {
              await run(() => api.updateRef(modal.kind, modal.id, v), 'Изменения сохранены');
            }
            setModal(null);
          }}
        />
      )}
      {notice && (
        <div
          onClick={() => setNotice(null)}
          style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--fin-text)', color: 'var(--fin-surface)', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 28px rgba(0,0,0,.24)', cursor: 'pointer', maxWidth: '70vw' }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
