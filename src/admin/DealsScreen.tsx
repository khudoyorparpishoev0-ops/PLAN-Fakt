import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, PLEX, SOFT, num } from '../theme';
import { fmt, fmtD } from '../lib/format';
import { badge, type BadgeData } from '../lib/badges';
import {
  api, ApiError,
  type ApiDealPayment, type ApiDealPosition, type ApiDeal, type ApiDeliveryPosition,
  type ApiDictionaries, type ApiProject, type DealStatus,
} from '../lib/api';
import { AccentBtn, Badge, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import { useEscapeClose } from '../lib/escape';
import { EmptyState } from '../components/states';

export interface DealsScreenProps {
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onError: (msg: string) => void;
  /** Сделка закрыта — обновить остатки склада и панель. */
  onChanged?: () => void;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };
const cell: CSSProperties = { padding: '11px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 };

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
  <div onClick={onClick} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
  </div>
);

/** Иконка монет (выплаты). */
const CoinsIcon = ({ size, stroke }: { size: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke || 'currentColor'} strokeWidth="1.5"><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4" /><path d="M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8" /></svg>
);

/** Иконка грузовика (поставки). */
const TruckIcon = ({ size, stroke }: { size: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke || 'currentColor'} strokeWidth="1.5"><rect x="1" y="4" width="9" height="6.5" rx="1" /><path d="M10 6.5h2.5L15 9v1.5h-5" /><circle cx="4" cy="11.5" r="1.2" /><circle cx="12" cy="11.5" r="1.2" /></svg>
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
  useEscapeClose(onClose);
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
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Новая закупка</div><CloseBtn onClick={onClose} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Название сделки <span style={{ color: 'var(--fin-minus)' }}>*</span></div>
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
            style={{ width: '100%', height: 64, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', resize: 'none' }} />
        </div>
        {error && <div style={{ fontSize: 12.5, color: 'var(--fin-minus)', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отменить</div>
          <div onClick={submit} className="hv-dim" style={{ background: valid ? ACC : 'var(--fin-border)', color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default' }}>Создать</div>
        </div>
      </div>
    </div>
  );
}

/** Модалка «Добавьте операции к сделке»: список расходных операций журнала. */
function PayModal({ dealId, onClose, onDone, onError }: {
  dealId: number;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  useEscapeClose(onClose);
  const [rows, setRows] = useState<ApiDealPayment[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.paymentCandidates(dealId)
      .then(r => { if (alive) setRows(r); })
      .catch((e: unknown) => onError(e instanceof ApiError ? e.message : 'Не удалось загрузить операции'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const needle = q.trim().toLowerCase();
  const view = rows.filter(o =>
    !needle || (o.party ?? '').toLowerCase().includes(needle) || (o.article ?? '').toLowerCase().includes(needle));

  const attach = async () => {
    if (!sel.size) return;
    setBusy(true);
    try {
      await api.addPayments(dealId, [...sel]);
      await onDone();
      onClose();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось прикрепить выплаты');
      setBusy(false);
    }
  };

  const selectedSum = rows.filter(o => sel.has(o.id)).reduce((a, o) => a + o.amount, 0);

  return (
    <div data-pay-modal style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 800, maxWidth: '96vw', maxHeight: '88vh', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 22px', borderBottom: '1px solid var(--fin-divider)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Добавьте выплаты к сделке</div>
          <div style={{ flex: 1 }} />
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: '12px 22px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по контрагенту или статье"
            style={{ width: '100%', height: 34, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 11px', fontSize: 12.5, outline: 'none' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px' }}>
          {loading && <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', padding: '10px 0' }}>Загрузка…</div>}
          {!loading && view.length === 0 && (
            <EmptyState tone="neutral" title="Свободных выплат нет"
              text="Прикрепить можно расходную операцию журнала, ещё не привязанную к другой сделке. Если у сделки указан поставщик — показываются операции по нему." />
          )}
          {view.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ width: 30, borderBottom: '1px solid var(--fin-border)' }} />
                <Th style={{ padding: '8px 10px' }}>Дата</Th>
                <Th style={{ padding: '8px 10px' }}>Счёт</Th>
                <Th style={{ padding: '8px 10px' }}>Контрагент</Th>
                <Th style={{ padding: '8px 10px' }}>Статья</Th>
                <Th right style={{ padding: '8px 10px' }}>Сумма</Th>
              </tr></thead>
              <tbody>
                {view.map(o => (
                  <tr key={o.id} onClick={() => setSel(st => { const n = new Set(st); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })}
                    className="hv-row" style={{ cursor: 'pointer', background: sel.has(o.id) ? 'var(--fin-surface-alt)' : undefined }}>
                    <td style={{ padding: 10, borderBottom: '1px solid var(--fin-divider)' }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${sel.has(o.id) ? ACC : 'var(--fin-border)'}`, background: sel.has(o.id) ? ACC : 'var(--fin-surface)', color: 'var(--fin-surface)' }}>
                        {sel.has(o.id) && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.2l2.4 2.4L9.5 3.8" /></svg>}
                      </span>
                    </td>
                    <td style={{ padding: 10, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, fontFamily: PLEX, whiteSpace: 'nowrap' }}>{fmtD(o.date)}</td>
                    <td style={{ padding: 10, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 }}>{o.account ?? '—'}</td>
                    <td style={{ padding: 10, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 }}>{o.party ?? '—'}</td>
                    <td style={{ padding: 10, borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: 'var(--fin-text-2)' }}>{o.article ?? '—'}</td>
                    <td style={{ padding: 10, borderBottom: '1px solid var(--fin-divider)', fontSize: 13, textAlign: 'right', fontWeight: 600, color: 'var(--fin-minus)', ...num, whiteSpace: 'nowrap' }}>−{fmt(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--fin-divider)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--fin-text-2)' }}>Выбрано: {sel.size} на <b style={{ color: 'var(--fin-text)', fontFamily: PLEX }}>{fmt(selectedSum)} TJS</b></span>
          <div style={{ flex: 1 }} />
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отменить</div>
          <div onClick={busy || !sel.size ? undefined : attach} className="hv-dim" style={{ background: sel.size && !busy ? ACC : 'var(--fin-border)', color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: sel.size && !busy ? 'pointer' : 'default' }}>Прикрепить</div>
        </div>
      </div>
    </div>
  );
}

/** Модалка «Создание поставки»: позиции из сделки или свои. */
function DeliveryModal({ deal, dicts, projects, onClose, onDone, onError }: {
  deal: ApiDeal;
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  useEscapeClose(onClose);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPlan, setIsPlan] = useState(false);
  const [entityName, setEntityName] = useState(dicts?.entities?.[0]?.name ?? '');
  const [projectId, setProjectId] = useState(deal.projectId ? String(deal.projectId) : '');
  const [rows, setRows] = useState<ApiDeliveryPosition[]>([]);
  const [busy, setBusy] = useState(false);

  /** Заполнить позициями сделки — как в прототипе. */
  const fillFromDeal = () =>
    setRows(deal.positions.map(p => ({
      name: p.name, goodId: p.goodId ?? null, qty: p.qty, unit: p.unit,
      price: Math.round(p.price * (1 - (p.discountPct || 0) / 100) * 100) / 100,
    })));

  useEffect(fillFromDeal, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (i: number, patch: Partial<ApiDeliveryPosition>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((a, p) => a + p.qty * p.price, 0);
  const valid = rows.some(r => r.name.trim().length >= 2 && r.qty > 0) && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await api.createDelivery(deal.id, {
        date, isPlan,
        entityName: entityName.trim() || undefined,
        ...(projectId ? { projectId: Number(projectId) } : {}),
        positions: rows
          .filter(r => r.name.trim().length >= 2 && r.qty > 0)
          .map(r => ({ name: r.name.trim(), ...(r.goodId ? { goodId: r.goodId } : {}), qty: r.qty, unit: r.unit || 'шт', price: r.price })),
      });
      await onDone();
      onClose();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось сохранить поставку');
      setBusy(false);
    }
  };

  return (
    <div data-delivery-modal style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 640, maxWidth: '96vw', maxHeight: '90vh', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '18px 22px', borderBottom: '1px solid var(--fin-divider)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Создание поставки</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>Сделка: <span style={{ color: ACC }}>{deal.title}</span></div>
          </div>
          <div style={{ flex: 1 }} />
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={lbl}>Дата поставки <span style={{ color: 'var(--fin-minus)' }}>*</span></div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, fontFamily: PLEX }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
              <label onClick={() => setIsPlan(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${isPlan ? ACC : 'var(--fin-border)'}`, background: isPlan ? ACC : 'var(--fin-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fin-surface)' }}>
                  {isPlan && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.2l2.4 2.4L9.5 3.8" /></svg>}
                </span>
                Плановая поставка
              </label>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={lbl}>Юрлицо</div>
              <select value={entityName} onChange={e => setEntityName(e.target.value)} style={inp}>
                <option value="">— не указано —</option>
                {(dicts?.entities ?? []).map(en => <option key={en.id} value={en.name}>{en.name}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Проект</div>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}>
                <option value="">— без проекта —</option>
                {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Товары и услуги поставки</span>
            <span onClick={fillFromDeal} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>Заполнить позициями из сделки</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--fin-divider)' }}>
            <thead><tr>
              <Th style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)' }}>Наименование</Th>
              <Th right style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)' }}>Кол-во</Th>
              <Th right style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)' }}>Цена</Th>
              <Th right style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)' }}>Сумма</Th>
              <th style={{ borderBottom: '1px solid var(--fin-divider)', width: 34 }} />
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i}>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)' }}>
                    <input value={p.name} onChange={e => setRow(i, { name: e.target.value })}
                      style={{ width: '100%', height: 30, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 8px', fontSize: 12.5, outline: 'none' }} />
                  </td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right' }}>
                    <input value={String(p.qty)} onChange={e => setRow(i, { qty: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                      style={{ width: 68, height: 30, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 8px', fontSize: 12.5, textAlign: 'right', outline: 'none', ...num }} />
                  </td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right' }}>
                    <input value={String(p.price)} onChange={e => setRow(i, { price: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                      style={{ width: 84, height: 30, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 8px', fontSize: 12.5, textAlign: 'right', outline: 'none', ...num }} />
                  </td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'right', fontSize: 12.5, fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(Math.round(p.qty * p.price))}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--fin-divider)', textAlign: 'center' }}>
                    <div onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} title="Убрать позицию" className="hv-cream"
                      style={{ width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-minus)' }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '18px 10px', textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-4)' }}>Позиций нет — заполните из сделки или добавьте вручную.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 2px', fontSize: 12.5, color: 'var(--fin-text-3)' }}>
            <span onClick={() => setRows(rs => [...rs, { name: '', goodId: null, qty: 1, unit: 'шт', price: 0 }])} style={{ fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Добавить позицию</span>
            <span>Сумма отгрузки: <b style={{ color: 'var(--fin-text)', fontFamily: PLEX }}>{fmt(Math.round(total))} TJS</b></span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', lineHeight: 1.5 }}>
            {isPlan
              ? 'Плановая поставка — только документ, склад не меняется.'
              : 'Позиции с товаром из справочника сразу поступят на склад.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--fin-divider)' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отменить</div>
          <div onClick={submit} className="hv-dim" style={{ background: valid ? ACC : 'var(--fin-border)', color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default' }}>Сохранить</div>
        </div>
      </div>
    </div>
  );
}

/** Карточка сделки: сводка, статус и редактор позиций. */
function DealCard({ deal, dicts, projects, onBack, onError, onReload, onClosed, onStockChanged }: {
  deal: ApiDeal;
  dicts: ApiDictionaries | null;
  projects: ApiProject[];
  onBack: () => void;
  onError: (msg: string) => void;
  onReload: () => Promise<void>;
  onClosed: () => void;
  /** Склад изменился — обновить остатки и уведомления. */
  onStockChanged: () => void;
}) {
  useEscapeClose(onBack);
  const [rows, setRows] = useState<ApiDealPosition[]>(deal.positions);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'goods' | 'pay' | 'delivery'>('goods');
  const [payModal, setPayModal] = useState(false);
  const [delivModal, setDelivModal] = useState(false);
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

  const paid = deal.paid, delivered = deal.delivered;
  const weOwe = Math.max(total - paid, 0), supOwe = Math.max(total - delivered, 0);
  const pct = (v: number) => (total ? Math.min(Math.round((v / total) * 100), 100) : 0);

  /** Карточка «Выплаты» / «Поставки» с прогрессом — как в прототипе. */
  const progressCard = (
    label: string, action: string, onAction: () => void,
    icon: JSX.Element, value: number, oweLabel: string, owe: number, oweFg: string,
  ) => (
    <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)' }}>{label}</span>
        {!locked && <span onClick={onAction} style={{ fontSize: 12, fontWeight: 700, color: ACC, cursor: 'pointer' }}>{action}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--fin-divider)', color: 'var(--fin-text-4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, ...num }}>{fmt(Math.round(value))} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fin-text-5)' }}>TJS</span></div>
          <div style={{ fontSize: 11, color: 'var(--fin-text-5)', fontFamily: PLEX }}>из {fmt(Math.round(total))} TJS</div>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--fin-bg)', borderRadius: 99, overflow: 'hidden', margin: '11px 0 8px' }}>
        <div style={{ height: '100%', background: ACC, width: pct(value) + '%' }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{pct(value)}%</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{oweLabel}: <span style={{ color: oweFg, ...num }}>{fmt(Math.round(owe))} TJS</span></div>
    </div>
  );

  /** Открепить выплату от сделки (операция остаётся в журнале). */
  const detachPayment = async (operationId: number) => {
    try {
      await api.removePayment(deal.id, operationId);
      await onReload();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось открепить выплату');
    }
  };

  /** Удалить поставку вместе с её приходом на склад. */
  const dropDelivery = async (deliveryId: number) => {
    if (!window.confirm('Удалить поставку? Приход по ней будет снят со склада.')) return;
    try {
      await api.removeDelivery(deal.id, deliveryId);
      await onReload();
      onStockChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось удалить поставку');
    }
  };

  const tabBtn = (k: 'goods' | 'pay' | 'delivery', label: string, count: number) => (
    <div onClick={() => setTab(k)} data-deal-tab={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: tab === k ? 'var(--fin-text)' : 'var(--fin-text-3)', background: tab === k ? 'var(--fin-hover)' : 'transparent' }}>
      {label} <span style={{ color: 'var(--fin-text-5)' }}>{count}</span>
    </div>
  );

  const numInput = (value: number, onChange: (v: number) => void, width: number) => (
    <input
      value={String(value)}
      onChange={e => onChange(parseFloat(e.target.value.replace(',', '.')) || 0)}
      disabled={locked}
      style={{ width, height: 32, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 8px', fontSize: 12.5, textAlign: 'right', background: locked ? 'var(--fin-hover)' : 'var(--fin-surface)', outline: 'none', ...num }}
    />
  );

  return (
    <div>
      <div onClick={onBack} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer', marginBottom: 8 }}>‹ Сделки закупок</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{deal.title}</div>
        <span style={{ fontSize: 12.5, color: 'var(--fin-text-4)', fontFamily: PLEX }}>{deal.number}</span>
        <Badge b={st} />
        <div style={{ flex: 1 }} />
        {deal.status === 'draft' && <div onClick={busy ? undefined : () => changeStatus('active')} className="hv-soft" style={{ border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>В работу</div>}
        {(deal.status === 'draft' || deal.status === 'active') && (
          <>
            <div onClick={busy ? undefined : () => changeStatus('canceled')} className="hv-soft" style={{ border: '1px solid var(--fin-border)', background: 'var(--fin-surface)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--fin-minus)', cursor: 'pointer' }}>Отменить</div>
            <div onClick={busy ? undefined : () => changeStatus('done')} className="hv-dim" style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Завершить сделку</div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr', gap: 14, marginBottom: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginBottom: 3 }}>Сделка на сумму</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', ...num }}>{fmt(Math.round(total))} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fin-text-5)' }}>TJS</span></div>
          <div style={{ borderTop: '1px solid var(--fin-divider)', marginTop: 13, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--fin-text-4)', width: 84 }}>Тип</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--fin-divider)', borderRadius: 6, padding: '2px 9px', fontWeight: 600 }}><CartIcon size={12} stroke="var(--fin-text-3)" />Закупка</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--fin-text-4)', width: 84 }}>Поставщик</span><span style={{ fontWeight: 600 }}>{deal.counterparty ?? '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--fin-text-4)', width: 84 }}>Проект</span><span style={{ fontWeight: 600 }}>{deal.project ?? '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--fin-text-4)', width: 84 }}>Дата</span><span style={{ fontWeight: 500, fontFamily: PLEX }}>{fmtD(deal.date)}</span></div>
          </div>
        </div>
        {progressCard('ВЫПЛАТЫ ПОСТАВЩИКУ', 'ДОБАВИТЬ', () => setPayModal(true), <CoinsIcon size={17} />, paid, 'Мы должны', weOwe, 'var(--fin-minus)')}
        {progressCard('ПОСТАВКИ', 'СОЗДАТЬ', () => setDelivModal(true), <TruckIcon size={17} />, delivered, 'Поставщик должен', supOwe, 'var(--fin-warn)')}
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '6px 8px', marginBottom: 12, flexWrap: 'wrap' }}>
        {tabBtn('goods', 'Товары и услуги', rows.length)}
        {tabBtn('pay', 'Выплаты', deal.payments.length)}
        {tabBtn('delivery', 'Поставки', deal.deliveries.length)}
      </div>

      {tab === 'goods' && (
      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>
            {locked
              ? 'Позиции закрытой сделки не редактируются'
              : `Товары и услуги для закупки${stockPositions ? `, из них ${stockPositions} с привязкой к складу` : ''}. Товар поступает на склад при поставке, а если поставок не оформляли — при завершении сделки.`}
          </span>
          {!locked && <span onClick={addRow} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Добавить позицию</span>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '8px 12px 8px 16px', borderTop: '1px solid var(--fin-divider)' }}>Наименование</Th>
              <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Товар со склада</Th>
              <Th right style={{ borderTop: '1px solid var(--fin-divider)' }}>Кол-во</Th>
              <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Ед.</Th>
              <Th right style={{ borderTop: '1px solid var(--fin-divider)' }}>Цена</Th>
              <Th right style={{ borderTop: '1px solid var(--fin-divider)' }}>Скидка, %</Th>
              <Th right style={{ borderTop: '1px solid var(--fin-divider)' }}>Сумма</Th>
              <th style={{ borderTop: '1px solid var(--fin-divider)', borderBottom: '1px solid var(--fin-border)', width: 40 }} />
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i}>
                  <td style={{ ...cell, padding: '9px 12px 9px 16px' }}>
                    <input value={p.name} onChange={e => setRow(i, { name: e.target.value })} disabled={locked} placeholder="Наименование"
                      style={{ width: '100%', minWidth: 150, height: 32, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 8px', fontSize: 12.5, background: locked ? 'var(--fin-hover)' : 'var(--fin-surface)', outline: 'none' }} />
                  </td>
                  <td style={cell}>
                    <select value={p.goodId ? String(p.goodId) : ''} onChange={e => pickGood(i, e.target.value)} disabled={locked}
                      style={{ width: '100%', minWidth: 140, height: 32, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 6px', fontSize: 12.5, background: locked ? 'var(--fin-hover)' : 'var(--fin-surface)' }}>
                      <option value="">— услуга —</option>
                      {(dicts?.goods ?? []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{numInput(p.qty, v => setRow(i, { qty: v }), 70)}</td>
                  <td style={cell}>
                    <input value={p.unit} onChange={e => setRow(i, { unit: e.target.value })} disabled={locked}
                      style={{ width: 60, height: 32, border: '1px solid var(--fin-border)', borderRadius: 7, padding: '0 8px', fontSize: 12.5, background: locked ? 'var(--fin-hover)' : 'var(--fin-surface)', outline: 'none' }} />
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{numInput(p.price, v => setRow(i, { price: v }), 90)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{numInput(p.discountPct || 0, v => setRow(i, { discountPct: v }), 70)}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(Math.round(posTotal(p)))}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {!locked && (
                      <div onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} title="Удалить позицию" className="hv-cream"
                        style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-minus)' }}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 0 }}>
                  <EmptyState title="Сделок пока нет"
                    text="Сделка закупки собирает позиции, выплаты и поставки в одном месте. Заведите первую — кнопкой выше." />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '11px 16px', fontSize: 12.5, color: 'var(--fin-text-3)', flexWrap: 'wrap' }}>
          <span>{rows.length} поз. на сумму: <b style={{ color: 'var(--fin-text)', fontFamily: PLEX }}>{fmt(Math.round(total))} TJS</b></span>
          {!locked && (
            <div onClick={busy ? undefined : savePositions} className="hv-dim" style={{ background: busy ? 'var(--fin-border)' : ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Сохранить позиции</div>
          )}
        </div>
      </div>
      )}

      {tab === 'pay' && (
        <div data-deal-payments style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Платежи поставщику за товары и услуги — операции журнала, привязанные к сделке</span>
            {!locked && <span onClick={() => setPayModal(true)} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Добавить выплату</span>}
          </div>
          {deal.payments.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '38px 20px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--fin-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}><CoinsIcon size={22} stroke="var(--fin-text-4)" /></div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Добавьте выплаты по сделке</div>
              <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', margin: '5px 0 14px', lineHeight: 1.5 }}>Учитывайте оплаты, чтобы видеть,<br />сколько мы ещё должны поставщику</div>
              {!locked && <div onClick={() => setPayModal(true)} className="hv-dim" style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Добавить</div>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th style={{ padding: '8px 16px', borderTop: '1px solid var(--fin-divider)' }}>Дата</Th>
                  <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Счёт</Th>
                  <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Контрагент</Th>
                  <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Статья</Th>
                  <Th right style={{ borderTop: '1px solid var(--fin-divider)' }}>Сумма</Th>
                  <th style={{ borderTop: '1px solid var(--fin-divider)', borderBottom: '1px solid var(--fin-border)', width: 40 }} />
                </tr></thead>
                <tbody>
                  {deal.payments.map(o => (
                    <tr key={o.id} className="hv-row">
                      <td style={{ ...cell, padding: '11px 16px', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{fmtD(o.date)}</td>
                      <td style={cell}>{o.account ?? '—'}</td>
                      <td style={cell}>{o.party ?? '—'}</td>
                      <td style={{ ...cell, color: 'var(--fin-text-2)' }}>{o.article ?? '—'}{!o.confirmed && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--fin-warn)', background: 'var(--fin-warn-soft)', borderRadius: 5, padding: '1px 6px' }}>не подтв.</span>}</td>
                      <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--fin-minus)', ...num, whiteSpace: 'nowrap' }}>−{fmt(o.amount)}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {!locked && (
                          <div onClick={() => void detachPayment(o.id)} title="Открепить от сделки" className="hv-cream"
                            style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '11px 16px', fontSize: 12.5, color: 'var(--fin-text-3)' }}>
                {deal.payments.length} выплат на сумму: <b style={{ color: 'var(--fin-text)', marginLeft: 6, fontFamily: PLEX }}>{fmt(Math.round(paid))} TJS</b>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'delivery' && (
        <div data-deal-deliveries style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Полученные товары и оказанные услуги; товары со склада приходуются в момент поставки</span>
            {!locked && <span onClick={() => setDelivModal(true)} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Создать поставку</span>}
          </div>
          {deal.deliveries.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '38px 20px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--fin-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}><TruckIcon size={22} stroke="var(--fin-text-4)" /></div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Добавьте поставку к сделке</div>
              <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', margin: '5px 0 14px', lineHeight: 1.5 }}>Отслеживайте товары и услуги,<br />которые вам уже поставили</div>
              {!locked && <div onClick={() => setDelivModal(true)} className="hv-dim" style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Добавить</div>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th style={{ padding: '8px 16px', borderTop: '1px solid var(--fin-divider)' }}>Дата</Th>
                  <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Юрлицо</Th>
                  <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Поставщик</Th>
                  <Th style={{ borderTop: '1px solid var(--fin-divider)' }}>Состав</Th>
                  <Th right style={{ borderTop: '1px solid var(--fin-divider)' }}>Сумма</Th>
                  <th style={{ borderTop: '1px solid var(--fin-divider)', borderBottom: '1px solid var(--fin-border)', width: 40 }} />
                </tr></thead>
                <tbody>
                  {deal.deliveries.map(v => (
                    <tr key={v.id} className="hv-row">
                      <td style={{ ...cell, padding: '11px 16px', fontFamily: PLEX, whiteSpace: 'nowrap' }}>
                        {fmtD(v.date)}
                        {v.isPlan && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--fin-accent)', background: 'var(--fin-accent-soft)', borderRadius: 5, padding: '1px 6px' }}>план</span>}
                      </td>
                      <td style={cell}>{v.entity ?? '—'}</td>
                      <td style={cell}>{v.party ?? '—'}</td>
                      <td style={cell}><span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fin-text-2)', background: 'var(--fin-divider)', borderRadius: 6, padding: '2px 8px' }}>{v.positions.length} поз.</span></td>
                      <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(Math.round(v.total))}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {!locked && (
                          <div onClick={() => void dropDelivery(v.id)} title="Удалить поставку" className="hv-cream"
                            style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-minus)' }}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '11px 16px', fontSize: 12.5, color: 'var(--fin-text-3)' }}>
                {deal.deliveries.length} поставок на сумму: <b style={{ color: 'var(--fin-text)', marginLeft: 6, fontFamily: PLEX }}>{fmt(Math.round(delivered))} TJS</b>
              </div>
            </div>
          )}
        </div>
      )}

      {deal.comment && <div style={{ fontSize: 12.5, color: 'var(--fin-text-3)', marginTop: 12 }}>Комментарий: {deal.comment}</div>}

      {payModal && (
        <PayModal dealId={deal.id} onClose={() => setPayModal(false)} onDone={onReload} onError={onError} />
      )}
      {delivModal && (
        <DeliveryModal
          deal={deal}
          dicts={dicts}
          projects={projects}
          onClose={() => setDelivModal(false)}
          onDone={async () => { await onReload(); onStockChanged(); }}
          onError={onError}
        />
      )}
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
        background: status === k ? 'var(--fin-surface)' : 'transparent', color: status === k ? 'var(--fin-text)' : 'var(--fin-text-3)',
        boxShadow: status === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
      }}>
      {label}
    </div>
  );

  if (sel) {
    return (
      <div data-screen-label="Сделки по закупкам">
        {flash && <div style={{ background: 'var(--fin-plus-soft)', border: '1px solid var(--fin-plus-soft)', color: 'var(--fin-plus)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 12 }}>{flash}</div>}
        <DealCard
          deal={sel}
          dicts={dicts}
          projects={projects}
          onBack={() => { setSelId(null); setFlash(null); }}
          onError={onError}
          onReload={load}
          onClosed={() => { setFlash('Сделка завершена: позиции с товарами оприходованы на склад.'); onChanged?.(); }}
          onStockChanged={() => onChanged?.()}
        />
      </div>
    );
  }

  return (
    <div data-screen-label="Сделки по закупкам">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Сделки по закупкам</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', background: 'var(--fin-bg)', padding: 3, borderRadius: 9, gap: 2 }}>
          {tab('all', 'Все')}{tab('active', 'В работе')}{tab('done', 'Завершённые')}
        </div>
        <AccentBtn onClick={() => setModal(true)}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Создать</AccentBtn>
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '9px 16px' }}>Название сделки</Th>
              <Th>Поставщик</Th>
              <Th>Проект</Th>
              <Th right>Дата</Th>
              <Th right>Сумма</Th>
              <Th right>Оплачено</Th>
              <Th right>Поставлено</Th>
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
                        <span style={{ fontSize: 11, color: 'var(--fin-text-5)', fontFamily: PLEX }}>{d.number}</span>
                      </span>
                    </div>
                  </td>
                  <td style={cell}>{d.counterparty ?? '—'}</td>
                  <td style={{ ...cell, color: 'var(--fin-text-2)' }}>{d.project ?? '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', color: 'var(--fin-text-3)', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{fmtD(d.date)}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{fmt(Math.round(d.total))}</td>
                  <td style={{ ...cell, textAlign: 'right', ...num, whiteSpace: 'nowrap', color: d.paid ? 'var(--fin-text-2)' : 'var(--fin-text-5)' }}>{d.paid ? fmt(Math.round(d.paid)) : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', ...num, whiteSpace: 'nowrap', color: d.delivered ? 'var(--fin-text-2)' : 'var(--fin-text-5)' }}>{d.delivered ? fmt(Math.round(d.delivered)) : '—'}</td>
                  <td style={{ ...cell, padding: '11px 16px 11px 12px' }}><Badge b={STATUS_B[d.status]} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-4)' }}>Сделок пока нет.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>
        Сделка собирает позиции закупки у поставщика и отслеживает частичные оплаты («мы должны») и поставки («поставщик должен»). Товары приходуются на склад при поставке, а если поставок не оформляли — при завершении сделки. Нажмите строку — откроется карточка сделки.
      </div>

      {modal && <DealModal dicts={dicts} projects={projects} onClose={() => setModal(false)} onSubmit={createDeal} />}
    </div>
  );
}
