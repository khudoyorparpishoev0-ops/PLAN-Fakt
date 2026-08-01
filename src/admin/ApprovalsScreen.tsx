import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, num } from '../theme';
import { fmt } from '../lib/format';
import { badge, type BadgeData } from '../lib/badges';
import { Badge, Th } from '../components/ui';
import { useEscapeClose } from '../lib/escape';
import { useIsMobile } from '../lib/responsive';
import {
  api, ApiError,
  type ApiProjectSummary, type ApiReqKind, type ApiRequest,
} from '../lib/api';

export interface ApprovalsScreenProps {
  /** Очередь изменилась — обновить счётчики и списки в оболочке. */
  onChanged: () => void;
  onError: (msg: string | null) => void;
}

/* ── Виды заявок ───────────────────────────────────────────────────────── */

const KIND_LABEL: Record<ApiReqKind, string> = { payment: 'Оплата', trip: 'Поездка', auto: 'Авто' };
/** Чип вида: оплата акцентная, поездка «внимание», авто нейтральное. */
const KIND_TONE: Record<ApiReqKind, 'blue' | 'yellow' | 'gray'> = {
  payment: 'blue', trip: 'yellow', auto: 'gray',
};

/** Готовые причины отклонения (макет «Кабинет директора»). */
const REASONS = [
  'Нет подтверждающего документа',
  'Не тот проект',
  'Сумма выше согласованной',
  'Обсудим лично',
];

/* ── Мелкие помощники ──────────────────────────────────────────────────── */

const DAY = 24 * 60 * 60 * 1000;

/** Сколько суток заявка ждёт решения. */
function waitDays(dateIso: string): number {
  const then = Date.parse(dateIso + 'T00:00:00Z');
  if (Number.isNaN(then)) return 0;
  const today = new Date();
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((now - then) / DAY));
}

const waitText = (d: number) => (d === 0 ? 'сегодня' : d === 1 ? '1 день' : `${d} дн.`);
/** Три дня в очереди — уже красный: заявка на оплату столько ждать не должна. */
const waitTone = (d: number): BadgeData => badge(waitText(d), d >= 3 ? 'red' : d >= 1 ? 'yellow' : 'gray');

/** Поездка измеряется километрами, остальное — деньгами. */
const isTrip = (r: ApiRequest) => r.kind === 'trip';
const amountOf = (r: ApiRequest) => (isTrip(r) ? (r.km ?? 0) : (r.amount ?? 0));
const unitOf = (r: ApiRequest) => (isTrip(r) ? 'км' : 'TJS');
const amountText = (r: ApiRequest) => (isTrip(r) ? `${fmt(r.km ?? 0)} км` : `−${fmt(r.amount ?? 0)}`);

const statusBadge = (r: ApiRequest): BadgeData => {
  if (r.stornoAt) return badge('Сторнировано', 'gray');
  if (r.status === 'approved') return badge('Одобрено', 'green');
  if (r.status === 'rejected') return badge('Отклонено', 'red');
  if (r.status === 'review') return badge('На рассмотрении', 'yellow');
  return badge('Ожидает решения', 'yellow');
};

/* ── Стили ─────────────────────────────────────────────────────────────── */

const card: CSSProperties = {
  background: 'var(--fin-surface)', border: '1px solid var(--fin-border)',
  borderRadius: 12, padding: 'var(--card-pad)',
};
const cell: CSSProperties = { padding: 'var(--row-pad)', borderBottom: '1px solid var(--fin-divider)' };
const fieldKey: CSSProperties = { flex: '0 0 116px', fontSize: 12.5, color: 'var(--fin-text-4)' };
const fieldVal: CSSProperties = { flex: 1, fontSize: 13, fontWeight: 500 };
const sectionLbl: CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--fin-text-4)',
};

/** Сегмент-контрол (период/вид) — общий вид из дизайн-системы. */
function Segment({ items, value, onChange, name }: {
  items: { id: string; label: string }[];
  value: string; onChange: (v: string) => void; name: string;
}) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--fin-segment)', padding: 3, borderRadius: 9, gap: 2 }}>
      {items.map((i) => {
        const on = i.id === value;
        return (
          <button
            key={i.id} type="button" data-seg={`${name}:${i.id}`} onClick={() => onChange(i.id)}
            style={{
              padding: '5px 14px', border: 'none', cursor: 'pointer', borderRadius: 7,
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 600 : 500,
              background: on ? 'var(--fin-surface)' : 'transparent',
              color: on ? 'var(--fin-text)' : 'var(--fin-text-3)',
              boxShadow: on ? 'var(--fin-shadow-seg)' : 'none',
            }}
          >{i.label}</button>
        );
      })}
    </div>
  );
}

/** Квадратный чекбокс строки. */
function Check({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      onClick={onClick} data-approve-check
      style={{
        width: 17, height: 17, borderRadius: 5, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer', flex: 'none',
        border: `1.5px solid ${on ? ACC : 'var(--fin-border)'}`,
        background: on ? ACC : 'var(--fin-surface)',
      }}
    >
      {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fin-surface)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
    </span>
  );
}

/** Экран согласования заявок — главный экран директора (макет «Кабинет директора»).
 *
 *  До этого согласование жило строкой в общем «списке внимания» на панели.
 *  Здесь оно вынесено в отдельный экран: очередь слева, разбор справа.
 *
 *  Асимметрия решений намеренная и взята из макета: одобрение причины не
 *  требует, отклонение — требует. По ТЗ (п. 5) автор может исправить
 *  отклонённую заявку и отправить снова, и без причины он не знает, что чинить. */
export default function ApprovalsScreen({ onChanged, onError }: ApprovalsScreenProps) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ApiRequest[]>([]);
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [kind, setKind] = useState<'all' | ApiReqKind>('all');
  const [selId, setSelId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [summary, setSummary] = useState<ApiProjectSummary | null>(null);

  const load = () => {
    api.requests()
      .then((r) => { setRows(r); onError(null); })
      .catch((e) => onError(e instanceof ApiError ? e.message : 'Не удалось загрузить заявки'));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  /* Очередь — всё, по чему решение ещё не принято. Черновики автора сюда
     не попадают: директор видит заявку только после отправки. */
  const pending = useMemo(() => rows.filter((r) => r.status === 'sent' || r.status === 'review'), [rows]);
  const decided = useMemo(() => rows.filter((r) => r.status === 'approved' || r.status === 'rejected'), [rows]);

  const source = tab === 'queue' ? pending : decided;
  const list = useMemo(
    () => (kind === 'all' ? source : source.filter((r) => r.kind === kind)),
    [source, kind],
  );

  const sel = useMemo(() => rows.find((r) => r.id === selId) ?? null, [rows, selId]);
  const selPending = sel != null && (sel.status === 'sent' || sel.status === 'review');

  /* Сводка проекта нужна блоку «Что меняется в цифрах»: одобрение создаёт
     плановую операцию расхода, то есть двигает план проекта. */
  useEffect(() => {
    if (!sel?.projectId || !selPending) { setSummary(null); return; }
    let alive = true;
    api.projectSummary(sel.projectId)
      .then((s) => { if (alive) setSummary(s); })
      .catch(() => { if (alive) setSummary(null); });
    return () => { alive = false; };
  }, [sel?.projectId, selPending]);

  /* Счётчики шапки: сумма считается без поездок — они в километрах. */
  const pendingSum = pending.reduce((a, r) => a + (r.kind === 'trip' ? 0 : (r.amount ?? 0)), 0);
  const oldest = pending.reduce((a, r) => Math.max(a, waitDays(r.date)), 0);

  const checkedIds = useMemo(
    () => pending.filter((r) => checked.has(r.id)).map((r) => r.id),
    [pending, checked],
  );
  const checkedSum = pending
    .filter((r) => checked.has(r.id) && r.kind !== 'trip')
    .reduce((a, r) => a + (r.amount ?? 0), 0);

  const after = (msg: string, ok = true) => {
    setToast({ text: msg, ok });
    setRejectOpen(false);
    setReason('');
    load();
    onChanged();
  };

  const decide = async (id: number, status: 'approved' | 'rejected', comment?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.changeRequestStatus(id, status, comment);
      after(status === 'approved'
        ? `Заявка ${r.number} одобрена · создана плановая операция`
        : `Заявка ${r.number} отклонена — автор увидит причину`);
    } catch (e) {
      setToast({ text: e instanceof ApiError ? e.message : 'Не удалось сохранить решение', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const approveChecked = async () => {
    if (busy || checkedIds.length === 0) return;
    setBusy(true);
    try {
      const res = await api.approveRequests(checkedIds);
      setChecked(new Set());
      after(res.skipped.length
        ? `Одобрено: ${res.approved}. Пропущено: ${res.skipped.length} — ${res.skipped[0].reason}`
        : `Одобрено заявок: ${res.approved} · плановые операции созданы`,
      res.skipped.length === 0);
    } catch (e) {
      setToast({ text: e instanceof ApiError ? e.message : 'Не удалось одобрить', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const storno = async (id: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.stornoRequest(id);
      after(`Заявка ${r.number} возвращена в очередь · плановая операция снята`);
    } catch (e) {
      setToast({ text: e instanceof ApiError ? e.message : 'Не удалось вернуть заявку', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pick = (id: number) => { setSelId(id); setRejectOpen(false); setReason(''); };

  return (
    <div data-screen-label="Согласование заявок" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Счётчики очереди ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {[
          { label: 'Ждут решения', value: String(pending.length), unit: pending.length === 1 ? 'заявка' : 'заявок',
            note: pending.length ? 'Решение принимает директор' : 'Очередь пуста', alarm: false },
          { label: 'На сумму', value: fmt(pendingSum), unit: 'TJS',
            note: 'Без учёта поездок — они считаются в километрах', alarm: false },
          { label: 'Самая старая', value: String(oldest), unit: oldest === 1 ? 'день' : 'дн.',
            note: oldest >= 3 ? 'Есть заявки старше трёх дней' : 'В пределах нормы', alarm: oldest >= 3 },
        ].map((s) => (
          <div key={s.label} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={sectionLbl}>{s.label}</div>
            <div style={{ ...num, fontSize: 27, fontWeight: 700, letterSpacing: '-.02em', color: s.alarm ? 'var(--fin-minus)' : 'var(--fin-text)' }}>
              {s.value} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fin-text-4)' }}>{s.unit}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fin-text-4)' }}>{s.note}</div>
          </div>
        ))}
      </div>

      {/* ── Фильтры и панель массового действия ──────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segment
          name="tab" value={tab} onChange={(v) => { setTab(v as 'queue' | 'history'); setSelId(null); setChecked(new Set()); }}
          items={[{ id: 'queue', label: 'Очередь' }, { id: 'history', label: 'Решённые' }]}
        />
        <Segment
          name="kind" value={kind} onChange={(v) => setKind(v as 'all' | ApiReqKind)}
          items={[
            { id: 'all', label: 'Все' }, { id: 'payment', label: 'Оплаты' },
            { id: 'trip', label: 'Поездки' }, { id: 'auto', label: 'Авто' },
          ]}
        />
        <div style={{ flex: 1 }} />
        {checkedIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 6px 5px 14px', background: 'var(--fin-accent-soft)', borderRadius: 9 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: ACC }}>
              Выбрано: {checkedIds.length} · {fmt(checkedSum)} TJS
            </span>
            <button
              type="button" data-approve-bulk onClick={approveChecked} disabled={busy}
              style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: ACC, color: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
            >Одобрить все</button>
            <button
              type="button" onClick={() => setChecked(new Set())}
              style={{ height: 32, padding: '0 10px', border: 'none', borderRadius: 8, background: 'transparent', color: ACC, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >Снять</button>
          </div>
        )}
      </div>

      {/* ── Очередь + разбор ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined, background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
          {list.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 7, padding: '56px 20px' }}>
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--fin-plus-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--fin-plus)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{tab === 'queue' ? 'Очередь пуста' : 'Решений пока нет'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', maxWidth: 320 }}>
                {tab === 'queue'
                  ? 'Все заявки разобраны. Новые появятся здесь, как только бухгалтер их отправит.'
                  : 'Здесь появятся заявки, по которым вы приняли решение.'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th style={{ width: 38, padding: 'var(--row-pad)' }} />
                  <Th style={{ padding: 'var(--row-pad)' }}>Заявка</Th>
                  <Th style={{ width: 92, padding: 'var(--row-pad)' }}>Ждёт</Th>
                  <Th right style={{ width: 120, padding: 'var(--row-pad)' }}>Сумма</Th>
                  <Th style={{ width: 86, padding: 'var(--row-pad)' }} />
                </tr></thead>
                <tbody>
                  {list.map((r) => {
                    const open = r.id === selId;
                    const pendingRow = r.status === 'sent' || r.status === 'review';
                    return (
                      <tr
                        key={r.id} onClick={() => pick(r.id)} className="hv-row" data-approve-row={r.number}
                        style={{ cursor: 'pointer', background: open ? 'var(--fin-accent-soft)' : 'transparent' }}
                      >
                        <td style={cell}>
                          {pendingRow && tab === 'queue' && (
                            <Check on={checked.has(r.id)} onClick={(e) => { e.stopPropagation(); toggle(r.id); }} />
                          )}
                        </td>
                        <td style={cell}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                              <Badge b={badge(KIND_LABEL[r.kind], KIND_TONE[r.kind])} fs={11} pad="2px 8px" dot={0} />
                              <span style={{ fontSize: 12, color: 'var(--fin-text-4)' }}>
                                {r.number} · {r.author} · {r.project}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td style={cell}><Badge b={waitTone(waitDays(r.date))} fs={11.5} pad="2px 8px" dot={0} /></td>
                        <td style={{ ...cell, textAlign: 'right' }}>
                          <span style={{ ...num, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: isTrip(r) ? 'var(--fin-text)' : 'var(--fin-minus)' }}>
                            {amountText(r)}
                          </span>
                        </td>
                        <td style={cell}>
                          {pendingRow ? (
                            /* Быстрые действия в строке: заявка на бензин за 340 сомони
                               не требует изучения — она закрывается одним нажатием. */
                            <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <span
                                onClick={(e) => { e.stopPropagation(); void decide(r.id, 'approved'); }}
                                title="Одобрить" data-approve-yes={r.number}
                                style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--fin-plus-soft)', color: 'var(--fin-plus)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              ><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                              <span
                                onClick={(e) => { e.stopPropagation(); pick(r.id); setRejectOpen(true); }}
                                title="Отклонить" data-approve-no={r.number}
                                style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--fin-minus-soft)', color: 'var(--fin-minus)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              ><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></span>
                            </span>
                          ) : (
                            <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Badge b={statusBadge(r)} fs={11} pad="2px 8px" /></span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Панель разбора ───────────────────────────────────────────── */}
        {!isMobile && (
          <aside style={{ width: 420, flex: 'none' }}>
            {sel ? (
              <DetailPanel
                req={sel} summary={summary} busy={busy}
                rejectOpen={rejectOpen} reason={reason}
                onOpenReject={() => setRejectOpen(true)}
                onCancelReject={() => { setRejectOpen(false); setReason(''); }}
                onReason={setReason}
                onApprove={() => void decide(sel.id, 'approved')}
                onReject={() => void decide(sel.id, 'rejected', reason)}
                onStorno={() => void storno(sel.id)}
              />
            ) : (
              <div style={{ background: 'var(--fin-surface)', border: '1px dashed var(--fin-border)', borderRadius: 12, padding: '44px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 7 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fin-text-2)' }}>Выберите заявку</div>
                <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>
                  Быстрые кнопки в строке решают без открытия карточки — но чек и фото одометра видно только здесь.
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* На узком экране разбор — шторка поверх списка */}
      {isMobile && sel && (
        <MobileSheet onClose={() => setSelId(null)}>
          <DetailPanel
            req={sel} summary={summary} busy={busy}
            rejectOpen={rejectOpen} reason={reason}
            onOpenReject={() => setRejectOpen(true)}
            onCancelReject={() => { setRejectOpen(false); setReason(''); }}
            onReason={setReason}
            onApprove={() => void decide(sel.id, 'approved')}
            onReject={() => void decide(sel.id, 'rejected', reason)}
            onStorno={() => void storno(sel.id)}
          />
        </MobileSheet>
      )}

      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 90,
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
          background: 'var(--fin-sidebar)', borderRadius: 8, boxShadow: 'var(--fin-shadow-pop)', maxWidth: '92vw',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: toast.ok ? 'var(--fin-plus)' : 'var(--fin-minus)' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fin-surface)' }}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

/* ── Панель разбора заявки ─────────────────────────────────────────────── */

function DetailPanel({ req, summary, busy, rejectOpen, reason, onOpenReject, onCancelReject, onReason, onApprove, onReject, onStorno }: {
  req: ApiRequest;
  summary: ApiProjectSummary | null;
  busy: boolean;
  rejectOpen: boolean;
  reason: string;
  onOpenReject: () => void;
  onCancelReject: () => void;
  onReason: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onStorno: () => void;
}) {
  const pending = req.status === 'sent' || req.status === 'review';
  const st = statusBadge(req);
  const att = req.attachments[0];

  const fields: { k: string; v: string }[] = [
    { k: 'Проект', v: req.project },
    { k: 'Автор', v: req.author },
    { k: 'Отправлена', v: req.date },
    { k: 'Тип', v: KIND_LABEL[req.kind] },
  ];
  if (req.kind === 'trip') fields.push({ k: 'Пробег', v: `${fmt(req.km ?? 0)} км` });
  if (req.kind === 'auto' && req.category) fields.push({ k: 'Категория', v: req.category });
  if (req.counterparty) fields.push({ k: 'Контрагент', v: req.counterparty });

  return (
    <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>

      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--fin-divider)', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ ...num, fontSize: 12, color: 'var(--fin-text-4)' }}>Заявка {req.number}</span>
          <Badge b={st} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{req.name}</div>
        <div style={{ ...num, fontSize: 27, fontWeight: 700, letterSpacing: '-.02em' }}>
          {fmt(amountOf(req))} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fin-text-4)' }}>{unitOf(req)}</span>
        </div>
      </div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9, borderBottom: '1px solid var(--fin-divider)' }}>
        {fields.map((f) => (
          <div key={f.k} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <span style={fieldKey}>{f.k}</span>
            <span style={fieldVal}>{f.v}</span>
          </div>
        ))}
      </div>

      {att && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--fin-divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLbl}>{req.kind === 'trip' ? 'Фото одометра' : 'Документ'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--fin-surface-alt)', borderRadius: 8 }}>
            <span style={{ width: 52, height: 52, flex: 'none', borderRadius: 8, background: 'var(--fin-segment)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--fin-text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6" /></svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.fileName}</span>
              <span style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>
                {/* Файл отдаётся только с токеном, поэтому не прямая ссылка,
                    а запрос с авторизацией и открытие blob в новой вкладке. */}
                {att.hasFile
                  ? <span onClick={() => void api.openAttachment(att.id)} style={{ fontWeight: 600, color: 'var(--fin-accent)', cursor: 'pointer' }}>открыть</span>
                  : 'файл недоступен'}
              </span>
            </span>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--fin-divider)' }}>
        <div style={sectionLbl}>История</div>
        <HistoryRow color="var(--fin-accent)" what="Создана и отправлена" when={req.date} />
        {req.decidedAt
          ? <HistoryRow
              color={req.status === 'approved' ? 'var(--fin-plus)' : 'var(--fin-minus)'}
              what={req.status === 'approved'
                ? `Одобрена: ${req.decidedBy ?? '—'}`
                : `Отклонена: ${req.decisionComment || 'без причины'}`}
              when={req.decidedAt}
            />
          : <HistoryRow color="var(--fin-warn)" hollow what="Ждёт решения директора" when={`${waitText(waitDays(req.date))} в очереди`} />}
        {req.stornoAt && <HistoryRow color="var(--fin-neutral)" what={`Сторнирована: ${req.stornoBy ?? '—'}`} when={req.stornoAt} />}
      </div>

      {/* ── Что меняется в цифрах ─────────────────────────────────────── */}
      {pending && summary && <Impact req={req} summary={summary} />}

      {pending ? (
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rejectOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Причина отклонения</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {REASONS.map((r) => {
                  const on = reason === r;
                  return (
                    <button
                      key={r} type="button" data-reason={r} onClick={() => onReason(r)}
                      style={{
                        padding: '6px 11px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                        border: `1px solid ${on ? 'var(--fin-minus)' : 'var(--fin-border)'}`,
                        background: on ? 'var(--fin-minus-soft)' : 'var(--fin-surface)',
                        color: on ? 'var(--fin-minus)' : 'var(--fin-text-2)',
                      }}
                    >{r}</button>
                  );
                })}
              </div>
              <textarea
                value={reason} onChange={(e) => onReason(e.target.value)} rows={3} maxLength={500}
                placeholder="Выберите причину или напишите свою — автор увидит её в заявке"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--fin-border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, resize: 'none', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Кнопка неактивна, пока причина не выбрана: по ТЗ автор
                    может исправить и отправить снова, и без причины он не
                    знает, что чинить. */}
                <button
                  type="button" data-reject-confirm onClick={onReject} disabled={!reason.trim() || busy}
                  style={{
                    flex: '1 1 auto', height: 'var(--fin-ctrl-h)', border: 'none', borderRadius: 8,
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                    background: reason.trim() ? 'var(--fin-minus)' : 'var(--fin-minus-soft)',
                    color: reason.trim() ? 'var(--fin-surface)' : 'var(--fin-text-5)',
                    cursor: reason.trim() && !busy ? 'pointer' : 'not-allowed',
                  }}
                >Отклонить заявку</button>
                <button
                  type="button" onClick={onCancelReject}
                  style={{ flex: '0 0 auto', height: 'var(--fin-ctrl-h)', padding: '0 14px', border: '1px solid var(--fin-border)', borderRadius: 8, background: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >Отмена</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button" data-approve-one onClick={onApprove} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 'var(--fin-ctrl-h)', border: 'none', borderRadius: 8, background: ACC, color: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                Одобрить
              </button>
              <button
                type="button" data-reject-open onClick={onOpenReject}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'var(--fin-ctrl-h)', border: '1px solid var(--fin-border)', borderRadius: 8, background: 'var(--fin-surface)', color: 'var(--fin-minus)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
              >Отклонить</button>
              <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', textAlign: 'center', lineHeight: 1.5 }}>
                Одобрение создаст плановую операцию расхода по проекту «{req.project}»
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8,
          background: req.status === 'approved' ? 'var(--fin-plus-soft)' : 'var(--fin-minus-soft)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: req.status === 'approved' ? 'var(--fin-plus)' : 'var(--fin-minus)' }}>
            {req.status === 'approved' ? 'Одобрено · плановая операция создана' : 'Отклонено'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fin-text-2)', lineHeight: 1.5 }}>
            {req.status === 'approved'
              ? `Расход ${fmt(amountOf(req))} ${unitOf(req)} встал в план проекта «${req.project}». Изменить заявку больше нельзя — только сторнировать.`
              : `Причина: ${req.decisionComment || 'не указана'}. Автор может исправить и отправить заново.`}
          </div>
          {req.status === 'approved' && !req.stornoAt && (
            <button
              type="button" data-storno onClick={onStorno} disabled={busy}
              style={{ alignSelf: 'flex-start', height: 32, padding: '0 12px', border: '1px solid var(--fin-border)', borderRadius: 8, background: 'var(--fin-surface)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
            >Вернуть в очередь</button>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ color, what, when, hollow }: { color: string; what: string; when: string; hollow?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flex: '0 0 8px', marginTop: 5, boxSizing: 'border-box',
        background: hollow ? 'transparent' : color, border: hollow ? `2px solid ${color}` : 'none',
      }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{what}</span>
        <span style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{when}</span>
      </span>
    </div>
  );
}

/** «Что меняется в цифрах»: последствие решения до нажатия.
 *
 *  Одобрение — не смена статуса, а бухгалтерское действие: по ТЗ (п. 8) оно
 *  создаёт плановую операцию расхода, и та немедленно попадает в план проекта.
 *  Цифры настоящие — из сводки проекта, а не иллюстрация. */
function Impact({ req, summary }: { req: ApiRequest; summary: ApiProjectSummary }) {
  const exp = summary.rows.filter((r) => r.type === 'expense');
  const plan = exp.reduce((a, r) => a + r.plan, 0);
  const fact = exp.reduce((a, r) => a + r.fact, 0);
  // Поездка пересчитывается в деньги по ставке компенсации уже на сервере,
  // поэтому её вклад в план тут не показываем — цифра была бы выдуманной.
  const add = req.kind === 'trip' ? null : (req.amount ?? 0);
  if (add == null) return null;

  const pctBefore = plan > 0 ? (fact / plan) * 100 : 0;
  const pctAfter = plan + add > 0 ? (fact / (plan + add)) * 100 : 0;

  // «Осталось оплатить», а не «свободный остаток»: в план проекта входят и
  // бюджет, и уже одобренные, но не оплаченные заявки. Одобрение увеличивает
  // именно обязательство — сумму, которую компании ещё предстоит заплатить.
  // Красным помечается только перерасход: рост плана сам по себе не авария.
  const rows: { label: string; before: string; after: string; alarm: boolean }[] = [
    { label: 'План по проекту', before: fmt(plan), after: fmt(plan + add), alarm: false },
    { label: 'Осталось оплатить', before: fmt(plan - fact), after: fmt(plan + add - fact), alarm: false },
    { label: 'Выполнение плана', before: `${pctBefore.toFixed(1)}%`, after: `${pctAfter.toFixed(1)}%`, alarm: pctAfter > 100 },
  ];

  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--fin-divider)' }}>
      <div style={sectionLbl}>Что меняется в цифрах</div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--fin-surface-alt)', borderRadius: 8 }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{r.label}</span>
          <span style={{ ...num, fontSize: 13, fontWeight: 600, color: 'var(--fin-text-4)' }}>{r.before}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fin-text-5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          <span style={{ ...num, fontSize: 13, fontWeight: 700, color: r.alarm ? 'var(--fin-minus)' : 'var(--fin-text)' }}>{r.after}</span>
        </div>
      ))}
    </div>
  );
}

/** Разбор заявки на узком экране — шторка снизу вверх. */
function MobileSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEscapeClose(onClose);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 460, maxWidth: '96vw', overflowY: 'auto', background: 'var(--fin-bg)', animation: 'finSlide .22s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0' }}>
          <span onClick={onClose} className="hv-cream" style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-3)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </span>
        </div>
        <div style={{ padding: 12 }}>{children}</div>
      </div>
    </div>
  );
}
