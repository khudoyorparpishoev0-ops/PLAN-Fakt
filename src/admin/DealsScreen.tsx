import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, PLEX, SOFT, num } from '../theme';
import { fmt, fmtD } from '../lib/format';
import { badge, type BadgeData } from '../lib/badges';
import {
  api, ApiError,
  type ApiDealPosition, type ApiDeal, type ApiDictionaries, type ApiProject, type DealStatus,
} from '../lib/api';
import { AccentBtn, Badge, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';

export interface DealsScreenProps {
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onError: (msg: string) => void;
  /** Сделка закрыта — обновить остатки склада и панель. */
  onChanged?: () => void;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };
const cell: CSSProperties = { padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 };

const STATUS_B: Record<DealStatus, BadgeData> = {
  draft: badge('Черновик', 'gray'),
  active: badge('В работе', 'blue'),
  done: badge('Завершена', 'green'),
  canceled: badge('Отменена', 'red'),
};

/** Иконка тележки (закупка). */
const CartIcon = ({ size, stroke }: { size: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke || 'currentColor'} strokeWidth="1.5"><circle cx="6" cy="13.5" r="1" /><circle cx="12" cy="13.5" r="1" /><path d="M1.5 2h2l1.5 8.5h7L14 5H4.2" /></svg>
);

const CloseBtn = ({ onClick }: { onClick: () => void }) => (
  <div onClick={onClick} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A918D' }}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
  </div>
);

/** Сумма позиции: количество × цена × (1 − скидка) — так же считает сервер. */
const posTotal = (p: ApiDealPosition) => Math.round(p.qty * p.price * (1 - (p.discountPct || 0) / 100) * 100) / 100;

/** Модалка создания сделки. */
function DealModal({ dicts, projects, onClose, onSubmit }: {
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onClose: () => void;
  onSubmit: (payload: { title: string; date: string; counterpartyId?: number; projectId?: number; comment?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [counterpartyId, setCounterpartyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 3 && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(), date,
        ...(counterpartyId ? { counterpartyId: Number(counterpartyId) } : {}),
        ...(projectId ? { projectId: Number(projectId) } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать сделку');
      setBusy(false);
    }
  };

  return (
    <div data-deal-modal style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Новая закупка</div><CloseBtn onClick={onClose} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Название сделки <span style={{ color: '#B93227' }}>*</span></div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Закупка материалов" style={inp} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Дата сделки</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, fontFamily: PLEX }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Поставщик</div>
          <select value={counterpartyId} onChange={e => setCounterpartyId(e.target.value)} style={inp}>
            <option value="">— не выбран —</option>
            {(dicts?.counterparties ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Основание закупки"
            style={{ width: '100%', height: 64, border: '1px solid #DFDCD6', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', resize: 'none' }} />
        </div>
        {error && <div style={{ fontSize: 12.5, color: '#B93227', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отменить</div>
          <div onClick={submit} className="hv-dim" style={{ background: valid ? ACC : '#B9C2BC', color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default' }}>Создать</div>
        </div>
      </div>
    </div>
  );
}

/** Карточка сделки: сводка, статус и редактор позиций. */
function DealCard({ deal, dicts, projects, onBack, onError, onReload, onClosed }: {
  deal: ApiDeal;
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onBack: () => void;
  onError: (msg: string) => void;
  onReload: () => Promise<void>;
  onClosed: () => void;
}) {
  const [rows, setRows] = useState<ApiDealPosition[]>(deal.positions);
  const [busy, setBusy] = useState(false);
  const isMobile = useIsMobile();
  const locked = deal.status === 'done' || deal.status === 'canceled';

  useEffect(() => { setRows(deal.positions); }, [deal.positions]);

  const total = rows.reduce((a, p) => a + posTotal(p), 0);
  const st = STATUS_B[deal.status];

  const setRow = (i: number, patch: Partial<ApiDealPosition>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addRow = () => setRows(rs => [...rs, { name: '', goodId: null, qty: 1, unit: 'шт', price: 0, discountPct: 0 }]);

  /** Выбор товара из справочника — позиция привяжется к складу при закрытии. */
  const pickGood = (i: number, value: string) => {
    if (!value) { setRow(i, { goodId: null }); return; }
    const good = (dicts?.goods ?? []).find(g => String(g.id) === value);
    setRow(i, { goodId: Number(value), name: good?.name ?? rows[i].name });
  };

  const savePositions = async () => {
    const clean = rows.filter(r => r.name.trim().length >= 2 && r.qty > 0);
    setBusy(true);
    try {
      await api.updateDeal(deal.id, {
        positions: clean.map(r => ({
          name: r.name.trim(), ...(r.goodId ? { goodId: r.goodId } : {}),
          qty: r.qty, unit: r.unit || 'шт', price: r.price, discountPct: r.discountPct || 0,
        })),
      });
      await onReload();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось сохранить позиции');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: DealStatus) => {
    setBusy(true);
    try {
      const res = await api.updateDeal(deal.id, { status });
      await onReload();
      if (res.closed) onClosed();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось изменить статус сделки');
    } finally {
      setBusy(false);
    }
  };

  const stockPositions = rows.filter(r => r.goodId).length;

  const card = (label: string, value: string, note: string) => (
    <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, ...num }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 2 }}>{note}</div>
    </div>
  );

  const numInput = (value: number, onChange: (v: number) => void, width: number) => (
    <input
      value={String(value)}
      onChange={e => onChange(parseFloat(e.target.value.replace(',', '.')) || 0)}
      disabled={locked}
      style={{ width, height: 32, border: '1px solid #DFDCD6', borderRadius: 7, padding: '0 8px', fontSize: 12.5, textAlign: 'right', background: locked ? '#F6F5F1' : '#fff', outline: 'none', ...num }}
    />
  );

  return (
    <div>
      <div onClick={onBack} style={{ fontSize: 12.5, fontWeight: 600, color: '#5A625E', cursor: 'pointer', marginBottom: 8 }}>‹ Сделки закупок</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{deal.title}</div>
        <span style={{ fontSize: 12.5, color: '#8A918D', fontFamily: PLEX }}>{deal.number}</span>
        <Badge b={st} />
        <div style={{ flex: 1 }} />
        {deal.status === 'draft' && <div onClick={busy ? undefined : () => changeStatus('active')} className="hv-soft" style={{ border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>В работу</div>}
        {(deal.status === 'draft' || deal.status === 'active') && (
          <>
            <div onClick={busy ? undefined : () => changeStatus('canceled')} className="hv-soft" style={{ border: '1px solid #E0DED8', background: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: '#B93227', cursor: 'pointer' }}>Отменить</div>
            <div onClick={busy ? undefined : () => changeStatus('done')} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Завершить сделку</div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr', gap: 14, marginBottom: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 11.5, color: '#8A918D', marginBottom: 3 }}>Сделка на сумму</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', ...num }}>{fmt(Math.round(total))} <span style={{ fontSize: 11, fontWeight: 500, color: '#A6ACA8' }}>TJS</span></div>
          <div style={{ borderTop: '1px solid #F0EFEA', marginTop: 13, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 84 }}>Тип</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EFEEEA', borderRadius: 6, padding: '2px 9px', fontWeight: 600 }}><CartIcon size={12} stroke="#6B7370" />Закупка</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 84 }}>Поставщик</span><span style={{ fontWeight: 600 }}>{deal.counterparty ?? '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 84 }}>Проект</span><span style={{ fontWeight: 600 }}>{deal.project ?? '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 84 }}>Дата</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{fmtD(deal.date)}</span></div>
          </div>
        </div>
        {card('ПОЗИЦИЙ', String(rows.length), `${stockPositions} с привязкой к складу`)}
        {card('СРЕДНЯЯ ПОЗИЦИЯ', rows.length ? fmt(Math.round(total / rows.length)) : '0', 'TJS на позицию')}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#8A918D' }}>
            {locked ? 'Позиции закрытой сделки не редактируются' : 'Товары и услуги для закупки. Позиции с товаром из справочника поступят на склад при завершении сделки.'}
          </span>
          {!locked && <span onClick={addRow} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Добавить позицию</span>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '8px 12px 8px 16px', borderTop: '1px solid #F0EFEA' }}>Наименование</Th>
              <Th style={{ borderTop: '1px solid #F0EFEA' }}>Товар со склада</Th>
              <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Кол-во</Th>
              <Th style={{ borderTop: '1px solid #F0EFEA' }}>Ед.</Th>
              <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Цена</Th>
              <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Скидка, %</Th>
              <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Сумма</Th>
              <th style={{ borderTop: '1px solid #F0EFEA', borderBottom: '1px solid #E7E5E0', width: 40 }} />
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i}>
                  <td style={{ ...cell, padding: '9px 12px 9px 16px' }}>
                    <input value={p.name} onChange={e => setRow(i, { name: e.target.value })} disabled={locked} placeholder="Наименование"
                      style={{ width: '100%', minWidth: 150, height: 32, border: '1px solid #DFDCD6', borderRadius: 7, padding: '0 8px', fontSize: 12.5, background: locked ? '#F6F5F1' : '#fff', outline: 'none' }} />
                  </td>
                  <td style={cell}>
                    <select value={p.goodId ? String(p.goodId) : ''} onChange={e => pickGood(i, e.target.value)} disabled={locked}
                      style={{ width: '100%', minWidth: 140, height: 32, border: '1px solid #DFDCD6', borderRadius: 7, padding: '0 6px', fontSize: 12.5, background: locked ? '#F6F5F1' : '#fff' }}>
                      <option value="">— услуга —</option>
                      {(dicts?.goods ?? []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{numInput(p.qty, v => setRow(i, { qty: v }), 70)}</td>
                  <td style={cell}>
                    <input value={p.unit} onChange={e => setRow(i, { unit: e.target.value })} disabled={locked}
                      style={{ width: 60, height: 32, border: '1px solid #DFDCD6', borderRadius: 7, padding: '0 8px', fontSize: 12.5, background: locked ? '#F6F5F1' : '#fff', outline: 'none' }} />
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{numInput(p.price, v => setRow(i, { price: v }), 90)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{numInput(p.discountPct || 0, v => setRow(i, { discountPct: v }), 70)}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(Math.round(posTotal(p)))}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {!locked && (
                      <div onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} title="Удалить позицию" className="hv-cream"
                        style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#B93227' }}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: '#8A918D' }}>Позиций пока нет.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '11px 16px', fontSize: 12.5, color: '#6B7370', flexWrap: 'wrap' }}>
          <span>{rows.length} поз. на сумму: <b style={{ color: '#1B1F1E', fontFamily: PLEX }}>{fmt(Math.round(total))} TJS</b></span>
          {!locked && (
            <div onClick={busy ? undefined : savePositions} className="hv-dim" style={{ background: busy ? '#B9C2BC' : ACC, color: '#fff', borderRadius: 9, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Сохранить позиции</div>
          )}
        </div>
      </div>

      {deal.comment && <div style={{ fontSize: 12.5, color: '#6B7370', marginTop: 12 }}>Комментарий: {deal.comment}</div>}
    </div>
  );
}

/** Экран «Закупки»: сделки с поставщиками и приход товаров на склад. */
export default function DealsScreen({ dicts, projects, onError, onChanged }: DealsScreenProps) {
  const [deals, setDeals] = useState<ApiDeal[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const [status, setStatus] = useState<'all' | DealStatus>('all');
  const [flash, setFlash] = useState<string | null>(null);

  const load = async () => {
    try {
      setDeals(await api.deals());
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось загрузить сделки');
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const rows = useMemo(() => (status === 'all' ? deals : deals.filter(d => d.status === status)), [deals, status]);
  const sel = selId != null ? deals.find(d => d.id === selId) ?? null : null;

  const createDeal = async (payload: { title: string; date: string; counterpartyId?: number; projectId?: number; comment?: string }) => {
    const res = await api.createDeal(payload);
    setModal(false);
    await load();
    setSelId(res.id);
  };

  const tab = (k: 'all' | DealStatus, label: string) => (
    <div key={k} onClick={() => setStatus(k)}
      style={{
        padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        background: status === k ? '#fff' : 'transparent', color: status === k ? '#1B1F1E' : '#6B7370',
        boxShadow: status === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
      }}>
      {label}
    </div>
  );

  if (sel) {
    return (
      <div data-screen-label="Сделки по закупкам">
        {flash && <div style={{ background: '#E6F4EB', border: '1px solid #BFE3CD', color: '#1A7A4B', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 12 }}>{flash}</div>}
        <DealCard
          deal={sel}
          dicts={dicts}
          projects={projects}
          onBack={() => { setSelId(null); setFlash(null); }}
          onError={onError}
          onReload={load}
          onClosed={() => { setFlash('Сделка завершена: позиции с товарами оприходованы на склад.'); onChanged?.(); }}
        />
      </div>
    );
  }

  return (
    <div data-screen-label="Сделки по закупкам">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Сделки по закупкам</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', background: '#EEF1EE', padding: 3, borderRadius: 9, gap: 2 }}>
          {tab('all', 'Все')}{tab('active', 'В работе')}{tab('done', 'Завершённые')}
        </div>
        <AccentBtn onClick={() => setModal(true)}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Создать</AccentBtn>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '9px 16px' }}>Название сделки</Th>
              <Th>Поставщик</Th>
              <Th>Проект</Th>
              <Th right>Дата</Th>
              <Th right>Позиций</Th>
              <Th right>Сумма</Th>
              <Th style={{ padding: '9px 16px 9px 12px' }}>Статус</Th>
            </tr></thead>
            <tbody>
              {rows.map(d => (
                <tr key={d.id} onClick={() => setSelId(d.id)} className="hv-row" style={{ cursor: 'pointer' }}>
                  <td style={{ ...cell, padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: SOFT, color: ACC, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><CartIcon size={15} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{d.title}</span>
                        <span style={{ fontSize: 11, color: '#A6ACA8', fontFamily: PLEX }}>{d.number}</span>
                      </span>
                    </div>
                  </td>
                  <td style={cell}>{d.counterparty ?? '—'}</td>
                  <td style={{ ...cell, color: '#5A625E' }}>{d.project ?? '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', color: '#6B7370', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{fmtD(d.date)}</td>
                  <td style={{ ...cell, textAlign: 'right', color: '#6B7370', ...num }}>{d.positions.length}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(Math.round(d.total))}</td>
                  <td style={{ ...cell, padding: '11px 16px 11px 12px' }}><Badge b={STATUS_B[d.status]} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: '#8A918D' }}>Сделок пока нет.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#8A918D', marginTop: 10, lineHeight: 1.5 }}>
        Сделка собирает позиции закупки у поставщика. При завершении сделки позиции, привязанные к товарам справочника, приходуются на склад. Нажмите строку — откроется карточка сделки.
      </div>

      {modal && <DealModal dicts={dicts} projects={projects} onClose={() => setModal(false)} onSubmit={createDeal} />}
    </div>
  );
}
