import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmt } from '../lib/format';
import { badge } from '../lib/badges';
import { api, ApiError, type ApiClient } from '../lib/api';
import { Badge, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import { useEscapeClose } from '../lib/escape';

export interface ClientsScreenProps {
  onError: (msg: string) => void;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };
const cell: CSSProperties = { padding: '11px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 };

type Kind = ApiClient['kind'];

const KIND_LABEL: Record<Kind, string> = { client: 'Клиент', supplier: 'Поставщик', both: 'Клиент и поставщик' };
const kindB = (k: Kind) => (k === 'client' ? badge('Клиент', 'green') : k === 'supplier' ? badge('Поставщик', 'blue') : badge('Клиент и поставщик', 'gray'));

/** Карточка контрагента: реквизиты и обороты. */
function ClientDrawer({ item, onClose, onSaved, onError }: {
  item: ApiClient;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  useEscapeClose(onClose);
  const [kind, setKind] = useState<Kind>(item.kind);
  const [inn, setInn] = useState(item.inn ?? '');
  const [phone, setPhone] = useState(item.phone ?? '');
  const [email, setEmail] = useState(item.email ?? '');
  const [address, setAddress] = useState(item.address ?? '');
  const [contact, setContact] = useState(item.contact ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateClient(item.id, {
        kind, inn: inn.trim(), phone: phone.trim(), email: email.trim(),
        address: address.trim(), contact: contact.trim(), note: note.trim(),
      });
      onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось сохранить контрагента');
      setBusy(false);
    }
  };

  const money = (label: string, value: number, color: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--fin-text-4)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, ...num, whiteSpace: 'nowrap' }}>{fmt(value)}</div>
    </div>
  );

  return (
    <div data-client-drawer style={{ position: 'fixed', inset: 0, zIndex: 65 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '96vw', background: 'var(--fin-surface-alt)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'var(--fin-surface)', borderBottom: '1px solid var(--fin-border)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)' }}>{KIND_LABEL[item.kind]} · сделок: {item.deals}</div>
          </div>
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fin-text-4)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 14 }}>
            {money('Поступления, TJS', item.income, 'var(--fin-plus)')}
            {money('Выплаты, TJS', item.expense, 'var(--fin-minus)')}
          </div>

          <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fin-text-4)', marginBottom: 10 }}>РЕКВИЗИТЫ</div>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Тип контрагента</div>
              <select value={kind} onChange={e => setKind(e.target.value as Kind)} style={inp}>
                <option value="client">Клиент</option>
                <option value="supplier">Поставщик</option>
                <option value="both">Клиент и поставщик</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><div style={lbl}>ИНН</div><input value={inn} onChange={e => setInn(e.target.value)} placeholder="—" style={{ ...inp, fontFamily: PLEX }} /></div>
              <div><div style={lbl}>Телефон</div><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+992 …" style={{ ...inp, fontFamily: PLEX }} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><div style={lbl}>Эл. почта</div><input value={email} onChange={e => setEmail(e.target.value)} placeholder="—" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><div style={lbl}>Контактное лицо</div><input value={contact} onChange={e => setContact(e.target.value)} placeholder="—" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><div style={lbl}>Адрес</div><input value={address} onChange={e => setAddress(e.target.value)} placeholder="—" style={inp} /></div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>Комментарий</div><input value={note} onChange={e => setNote(e.target.value)} placeholder="—" style={inp} /></div>
            <div onClick={busy ? undefined : save} className="hv-dim" style={{ display: 'inline-block', background: busy ? 'var(--fin-border)' : ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Сохранить</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Экран «Клиенты»: контрагенты с оборотами и карточкой реквизитов. */
export default function ClientsScreen({ onError }: ClientsScreenProps) {
  const [items, setItems] = useState<ApiClient[]>([]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [sel, setSel] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const load = async () => {
    try {
      setItems(await api.clients());
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось загрузить контрагентов');
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(c =>
      (kind === 'all' || c.kind === kind || c.kind === 'both')
      && (!needle || c.name.toLowerCase().includes(needle) || (c.inn ?? '').includes(needle)),
    );
  }, [items, q, kind]);

  const selItem = sel != null ? items.find(c => c.id === sel) ?? null : null;
  const totalIn = rows.reduce((a, c) => a + c.income, 0);
  const totalOut = rows.reduce((a, c) => a + c.expense, 0);

  const tab = (k: 'all' | Kind, label: string) => (
    <div
      key={k}
      onClick={() => setKind(k)}
      style={{
        padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        background: kind === k ? 'var(--fin-surface)' : 'transparent', color: kind === k ? 'var(--fin-text)' : 'var(--fin-text-3)',
        boxShadow: kind === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
      }}
    >
      {label}
    </div>
  );

  return (
    <div data-screen-label="Клиенты">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)' }}>Обороты по контрагентам и карточки реквизитов</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', background: 'var(--fin-bg)', padding: 3, borderRadius: 9, gap: 2 }}>
          {tab('all', 'Все')}{tab('client', 'Клиенты')}{tab('supplier', 'Поставщики')}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по названию или ИНН"
          style={{ width: isMobile ? '100%' : 280, height: 36, border: '1px solid var(--fin-border)', borderRadius: 9, padding: '0 12px', fontSize: 12.5, outline: 'none', background: 'var(--fin-surface)' }} />
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--fin-text-4)' }}>
          Поступления: <b style={{ color: 'var(--fin-plus)', fontFamily: PLEX }}>{fmt(totalIn)}</b> · Выплаты: <b style={{ color: 'var(--fin-minus)', fontFamily: PLEX }}>{fmt(totalOut)}</b> TJS
        </div>
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '9px 16px' }}>Контрагент</Th>
              <Th>Тип</Th>
              <Th>ИНН</Th>
              <Th>Телефон</Th>
              <Th right>Поступления</Th>
              <Th right>Выплаты</Th>
              <Th right style={{ padding: '9px 16px 9px 12px' }}>Сделок</Th>
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} onClick={() => setSel(c.id)} className="hv-row" style={{ cursor: 'pointer' }}>
                  <td style={{ ...cell, padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{c.name}</td>
                  <td style={cell}><Badge b={kindB(c.kind)} /></td>
                  <td style={{ ...cell, color: 'var(--fin-text-3)', fontFamily: PLEX }}>{c.inn || '—'}</td>
                  <td style={{ ...cell, color: 'var(--fin-text-3)', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, color: c.income ? 'var(--fin-plus)' : 'var(--fin-text-5)', ...num, whiteSpace: 'nowrap' }}>{c.income ? fmt(c.income) : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, color: c.expense ? 'var(--fin-minus)' : 'var(--fin-text-5)', ...num, whiteSpace: 'nowrap' }}>{c.expense ? fmt(c.expense) : '—'}</td>
                  <td style={{ ...cell, padding: '11px 16px 11px 12px', textAlign: 'right', color: 'var(--fin-text-3)', ...num }}>{c.deals}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-4)' }}>Ничего не найдено.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>
        Список контрагентов ведётся в «Справочниках»; здесь видны обороты по подтверждённым операциям и число сделок закупки. Нажмите строку — откроется карточка реквизитов.
      </div>

      {selItem && (
        <ClientDrawer item={selItem} onClose={() => setSel(null)} onSaved={() => { setSel(null); void load(); }} onError={onError} />
      )}
    </div>
  );
}
