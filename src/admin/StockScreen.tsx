import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt, fmtD } from '../lib/format';
import { badge } from '../lib/badges';
import { api, ApiError, type ApiProject, type ApiStockItem, type ApiStockMove } from '../lib/api';
import { AccentBtn, Badge, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import { useEscapeClose } from '../lib/escape';

export interface StockScreenProps {
  projects: ApiProject[];
  onError: (msg: string) => void;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };
const cell: CSSProperties = { padding: '11px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 };

/** Количество без лишних нулей: 320 → «320», 4.5 → «4,5». */
const qty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

/** Модалка движения по складу: приход или списание. */
function MoveModal({ goods, projects, preset, onClose, onSubmit }: {
  goods: ApiStockItem[];
  projects: ApiProject[];
  preset?: { goodId: number; type: 'in' | 'out' };
  onClose: () => void;
  onSubmit: (payload: { goodId: number; type: 'in' | 'out'; qty: number; date?: string; projectId?: number; comment?: string }) => Promise<void>;
}) {
  useEscapeClose(onClose);
  const [goodId, setGoodId] = useState(String(preset?.goodId ?? goods[0]?.id ?? ''));
  const [type, setType] = useState<'in' | 'out'>(preset?.type ?? 'in');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const good = goods.find(g => String(g.id) === goodId);
  const value = parseFloat(amount.trim().replace(/\s/g, '').replace(',', '.'));
  const valid = goodId !== '' && Number.isFinite(value) && value > 0 && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        goodId: Number(goodId), type, qty: value, date,
        ...(projectId ? { projectId: Number(projectId) } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить движение');
      setBusy(false);
    }
  };

  const tab = (t: 'in' | 'out', label: string) => (
    <div
      onClick={() => setType(t)}
      style={{
        flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        background: type === t ? 'var(--fin-surface)' : 'transparent', color: type === t ? 'var(--fin-text)' : 'var(--fin-text-3)',
        boxShadow: type === t ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
      }}
    >
      {label}
    </div>
  );

  return (
    <div data-stock-modal style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Движение по складу</div>

        <div style={{ display: 'flex', gap: 3, background: 'var(--fin-bg)', padding: 3, borderRadius: 9, marginBottom: 14 }}>
          {tab('in', 'Приход')}{tab('out', 'Списание')}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Товар <span style={{ color: 'var(--fin-minus)' }}>*</span></div>
          <select value={goodId} onChange={e => setGoodId(e.target.value)} style={inp}>
            {goods.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={lbl}>Количество{good ? `, ${good.unit}` : ''} <span style={{ color: 'var(--fin-minus)' }}>*</span></div>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={{ ...inp, ...num }} />
            {good && type === 'out' && <div style={{ fontSize: 11, color: 'var(--fin-text-4)', marginTop: 3 }}>На складе: {qty(good.qty)} {good.unit}</div>}
          </div>
          <div>
            <div style={lbl}>Дата</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, fontFamily: PLEX }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Проект</div>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}>
            <option value="">— без проекта —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={lbl}>Комментарий</div>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Основание движения" style={inp} />
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--fin-minus)', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отменить</div>
          <div onClick={submit} className="hv-dim" style={{ background: valid ? ACC : 'var(--fin-border)', color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default' }}>Сохранить</div>
        </div>
      </div>
    </div>
  );
}

/** Карточка товара: параметры хранения и история движений. */
function GoodDrawer({ item, moves, onClose, onSaved, onMove, onError }: {
  item: ApiStockItem;
  moves: ApiStockMove[];
  onClose: () => void;
  onSaved: () => void;
  onMove: (type: 'in' | 'out') => void;
  onError: (msg: string) => void;
}) {
  useEscapeClose(onClose);
  const [sku, setSku] = useState(item.sku ?? '');
  const [unit, setUnit] = useState(item.unit);
  const [minQty, setMinQty] = useState(String(item.minQty));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateGood(item.id, {
        sku: sku.trim(), unit: unit.trim() || 'шт.',
        minQty: Number(minQty.replace(',', '.')) || 0,
      });
      onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось сохранить параметры товара');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 65 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '96vw', background: 'var(--fin-surface-alt)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'var(--fin-surface)', borderBottom: '1px solid var(--fin-border)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{item.note || 'Товар на складе'}</div>
          </div>
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', marginBottom: 10 }}>ОСТАТОК</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', ...num }}>{qty(item.qty)}</div>
              <div style={{ fontSize: 13, color: 'var(--fin-text-3)' }}>{item.unit}</div>
              {item.low && <Badge b={badge('Ниже минимума', 'red')} />}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div onClick={() => onMove('in')} className="hv-dim" style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Приход</div>
              <div onClick={() => onMove('out')} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Списание</div>
            </div>
          </div>

          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', marginBottom: 10 }}>ПАРАМЕТРЫ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={lbl}>Артикул</div><input value={sku} onChange={e => setSku(e.target.value)} placeholder="—" style={inp} /></div>
              <div><div style={lbl}>Единица</div><input value={unit} onChange={e => setUnit(e.target.value)} style={inp} /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={lbl}>Минимальный остаток</div>
              <input value={minQty} onChange={e => setMinQty(e.target.value)} style={{ ...inp, ...num }} />
              <div style={{ fontSize: 11, color: 'var(--fin-text-4)', marginTop: 4 }}>Ниже этого значения товар помечается как «Мало» на складе и в уведомлениях.</div>
            </div>
            <div onClick={busy ? undefined : save} className="hv-dim" style={{ marginTop: 12, display: 'inline-block', background: busy ? 'var(--fin-border)' : ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Сохранить</div>
          </div>

          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', padding: '14px 16px 8px' }}>ИСТОРИЯ ДВИЖЕНИЙ</div>
            {moves.length === 0 && <div style={{ padding: '4px 16px 16px', fontSize: 12.5, color: 'var(--fin-text-4)' }}>Движений пока нет.</div>}
            {moves.map(m => {
              // Номер сделки не повторяем, если он уже есть в комментарии
              const parts = [m.deal && !m.comment?.includes(m.deal) ? m.deal : null, m.project, m.comment].filter(Boolean);
              return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--fin-divider)' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: m.type === 'in' ? 'var(--fin-plus-soft)' : 'var(--fin-minus-soft)', color: m.type === 'in' ? 'var(--fin-plus)' : 'var(--fin-minus)', fontWeight: 700, fontSize: 13 }}>{m.type === 'in' ? '+' : '−'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{qty(m.qty)} {m.unit}</div>
                  <div style={{ fontSize: 11, color: 'var(--fin-text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parts.join(' · ') || 'Без основания'}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fin-text-3)', fontFamily: PLEX, flex: 'none' }}>{fmtD(m.date)}</div>
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Экран «Склад»: остатки товаров, движения, минимальные остатки. */
export default function StockScreen({ projects, onError }: StockScreenProps) {
  const [items, setItems] = useState<ApiStockItem[]>([]);
  const [moves, setMoves] = useState<ApiStockMove[]>([]);
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [modal, setModal] = useState<{ goodId: number; type: 'in' | 'out' } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = useIsMobile();

  const load = async () => {
    try {
      const [st, mv] = await Promise.all([api.stock(), api.stockMoves()]);
      setItems(st);
      setMoves(mv);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось загрузить склад');
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(i =>
      (!onlyLow || i.low)
      && (!needle || i.name.toLowerCase().includes(needle) || (i.sku ?? '').toLowerCase().includes(needle)),
    );
  }, [items, q, onlyLow]);

  const lowCount = items.filter(i => i.low).length;
  const selItem = sel != null ? items.find(i => i.id === sel) ?? null : null;

  const createMove = async (payload: { goodId: number; type: 'in' | 'out'; qty: number; date?: string; projectId?: number; comment?: string }) => {
    await api.createStockMove(payload);
    setModal(null);
    setModalOpen(false);
    await load();
  };

  const kpi = (label: string, value: string, note: string, color?: string) => (
    <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '13px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: color ?? 'var(--fin-text)', ...num }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 2 }}>{note}</div>
    </div>
  );

  return (
    <div data-screen-label="Склад">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Остатки товаров и движения по складу</div>
        <div style={{ flex: 1 }} />
        <AccentBtn onClick={() => { setModal(null); setModalOpen(true); }}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Движение</AccentBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
        {kpi('ПОЗИЦИЙ', String(items.length), 'товаров в номенклатуре')}
        {kpi('НИЖЕ МИНИМУМА', String(lowCount), lowCount ? 'нужно пополнить' : 'все остатки в норме', lowCount ? 'var(--fin-minus)' : 'var(--fin-plus)')}
        {kpi('ДВИЖЕНИЙ', fmt(moves.length), 'приходов и списаний')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по названию или артикулу"
          style={{ width: isMobile ? '100%' : 260, height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, padding: '0 12px', fontSize: 12.5, outline: 'none', background: 'var(--fin-surface)' }} />
        <div onClick={() => setOnlyLow(v => !v)} className="hv-soft"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid ' + (onlyLow ? ACC : 'var(--fin-border)'), background: onlyLow ? 'var(--fin-accent-soft)' : 'var(--fin-surface)', color: onlyLow ? ACC : 'var(--fin-text-2)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          Только «мало»
        </div>
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '9px 16px' }}>Наименование</Th>
              <Th>Артикул</Th>
              <Th right>Остаток</Th>
              <Th>Ед.</Th>
              <Th right>Минимум</Th>
              <Th style={{ padding: '9px 16px 9px 12px' }}>Статус</Th>
            </tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id} onClick={() => setSel(i.id)} className="hv-row" style={{ cursor: 'pointer' }}>
                  <td style={{ ...cell, padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{i.name}</td>
                  <td style={{ ...cell, color: 'var(--fin-text-3)', fontFamily: PLEX }}>{i.sku || '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, ...num }}>{qty(i.qty)}</td>
                  <td style={{ ...cell, color: 'var(--fin-text-3)' }}>{i.unit}</td>
                  <td style={{ ...cell, textAlign: 'right', color: 'var(--fin-text-3)', ...num }}>{qty(i.minQty)}</td>
                  <td style={{ ...cell, padding: '11px 16px 11px 12px' }}>
                    <Badge b={i.low ? badge('Мало', 'red') : badge('В норме', 'green')} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-4)' }}>Ничего не найдено.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>
        Остаток считается как сумма приходов минус списания. Приход создаётся автоматически при завершении сделки закупки — позиции сделки попадают на склад.
      </div>

      {selItem && (
        <GoodDrawer
          item={selItem}
          moves={moves.filter(m => m.goodId === selItem.id)}
          onClose={() => setSel(null)}
          onSaved={() => { setSel(null); void load(); }}
          onMove={type => { setModal({ goodId: selItem.id, type }); setModalOpen(true); setSel(null); }}
          onError={onError}
        />
      )}

      {modalOpen && items.length > 0 && (
        <MoveModal
          goods={items}
          projects={projects}
          preset={modal ?? undefined}
          onClose={() => { setModal(null); setModalOpen(false); }}
          onSubmit={createMove}
        />
      )}
    </div>
  );
}
