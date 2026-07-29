import { useState } from 'react';
import { ACC, C, GOLOS, PLEX, SOFT, num } from '../theme';
import { fmt } from '../lib/format';
import { ATTACH, POSITIONS } from '../data/admin';
import { AccentBtn, Badge, Th } from '../components/ui';

/** Поставка в рамках сделки. */
interface Delivery { date: string; entity: string; party: string; amount: number; positions: number }

/** Цвет статуса сделки. */
const stColor: Record<string, { fg: string; bg: string; dot: string }> = {
  'Новая': C.yellow, 'В работе': C.blue, 'Завершена': C.green,
};

/** Даты выплат (фикстура прототипа). */
const PD = ['12 июл 2025', '14 июл 2025', '18 июл 2025', '22 июл 2025', '25 июл 2025'];

/** Иконка тележки (закупка). */
const CartIcon = ({ size, stroke }: { size: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke || 'currentColor'} strokeWidth="1.5"><circle cx="6" cy="13.5" r="1" /><circle cx="12" cy="13.5" r="1" /><path d="M1.5 2h2l1.5 8.5h7L14 5H4.2" /></svg>
);

/** Иконка монет (выплаты). */
const CoinsIcon = ({ size, stroke }: { size: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke || 'currentColor'} strokeWidth="1.5"><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4" /><path d="M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8" /></svg>
);

/** Иконка грузовика (поставки). */
const TruckIcon = ({ size, stroke }: { size: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke || 'currentColor'} strokeWidth="1.5"><rect x="1" y="4" width="9" height="6.5" rx="1" /><path d="M10 6.5h2.5L15 9v1.5h-5" /><circle cx="4" cy="11.5" r="1.2" /><circle cx="12" cy="11.5" r="1.2" /></svg>
);

/** Крестик закрытия модалки. */
const CloseBtn = ({ onClick }: { onClick: () => void }) => (
  <div onClick={onClick} className="hv-cream" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A918D' }}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
  </div>
);

/** Экран «Закупки / Сделки по закупкам»: список, карточка сделки и 3 модалки. */
export default function DealsScreen() {
  const [dealsView, setDealsView] = useState<'list' | 'card'>('list');
  const [dealTab, setDealTab] = useState<'goods' | 'pay' | 'delivery'>('goods');
  const [dealModal, setDealModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [delivModal, setDelivModal] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);
  const [dealStatus, setDealStatus] = useState('В работе');
  const [payments, setPayments] = useState<number[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const dealTotal = POSITIONS.reduce((a, p) => a + Math.round(p[1] * p[3] * (1 - p[4] / 100)), 0);
  const posRows = POSITIONS.map(p => ({ name: p[0], qty: p[1], unit: p[2], price: fmt(p[3]), disc: p[4] + ' %', sum: fmt(Math.round(p[1] * p[3] * (1 - p[4] / 100))) }));
  const paid = payments.reduce((a, x) => a + x, 0), delivered = deliveries.reduce((a, x) => a + x.amount, 0);
  const weOwe = dealTotal - paid, supOwe = dealTotal - delivered;
  const pctI = (v: number) => (dealTotal ? Math.round((v / dealTotal) * 100) : 0);
  const dSt = stColor[dealStatus] || C.gray;
  const payRows = payments.map((x, i) => ({ date: PD[i] || '—', account: i % 2 ? 'Амонатбанк · TJS' : 'Касса', party: 'ТаджТехСнаб', article: 'Закупка материалов', sumF: '−' + fmt(x) }));
  const delivRows = deliveries.map(d => ({ date: d.date, entity: d.entity, party: d.party, comp: d.positions + ' поз.', sumF: fmt(d.amount) }));
  const attachOps = ATTACH.map(o => ({ date: o[0], account: o[1], party: o[2], article: o[3], sumF: '−' + fmt(o[5]), onAdd: () => setPayments(ps => [...ps, o[5]]) }));

  const dealTotalF = fmt(dealTotal), paidF = fmt(paid), deliveredF = fmt(delivered), weOweF = fmt(weOwe), supOweF = fmt(supOwe);
  const paidPctW = pctI(paid) + '%', delivPctW = pctI(delivered) + '%';

  const tGoods = { fg: dealTab === 'goods' ? '#1B1F1E' : '#6B7370', bg: dealTab === 'goods' ? '#F1F0EB' : 'transparent' };
  const tPay = { fg: dealTab === 'pay' ? '#1B1F1E' : '#6B7370', bg: dealTab === 'pay' ? '#F1F0EB' : 'transparent' };
  const tDeliv = { fg: dealTab === 'delivery' ? '#1B1F1E' : '#6B7370', bg: dealTab === 'delivery' ? '#F1F0EB' : 'transparent' };

  const statusOptions = ['Новая', 'В работе', 'Завершена'].map(t => ({
    t, dot: (stColor[t] || C.gray).dot, cur: dealStatus === t,
    onClick: () => { setDealStatus(t); setStatusMenu(false); },
  }));

  const createDeal = () => {
    setDealModal(false); setDealsView('card'); setDealStatus('Новая');
    setPayments([]); setDeliveries([]); setDealTab('goods');
  };
  const saveDelivery = () => {
    setDelivModal(false); setDealTab('delivery');
    setDeliveries(ds => [...ds, { date: '14 июл 2025', entity: 'ЮЛ · Насб Пайванд', party: 'ТаджТехСнаб', amount: 9950, positions: 2 }]);
  };

  return (
    <div data-screen-label="Сделки по закупкам">
      {dealsView === 'list' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Сделки по закупкам</div>
            <div title="Частичные оплаты и поставки в рамках сделки с поставщиком" style={{ width: 16, height: 16, borderRadius: '50%', border: '1.3px solid #C6CBC7', color: '#A6ACA8', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>?</div>
            <div style={{ flex: 1 }} />
            <AccentBtn onClick={() => setDealModal(true)}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Создать</AccentBtn>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th style={{ padding: '9px 16px' }}>Название сделки</Th>
                <Th style={{ padding: '9px 12px' }}>Поставщик</Th>
                <Th right style={{ padding: '9px 12px' }}>Дата</Th>
                <Th right style={{ padding: '9px 12px' }}>Сумма</Th>
                <Th right style={{ padding: '9px 12px' }}>Оплачено</Th>
                <Th right style={{ padding: '9px 12px' }}>Поставлено</Th>
                <Th style={{ padding: '9px 16px 9px 12px' }}>Статус</Th>
              </tr></thead>
              <tbody>
                <tr onClick={() => setDealsView('card')} className="hv-row" style={{ cursor: 'pointer' }}>
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid #F3F2ED' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: SOFT, color: ACC, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><CartIcon size={15} /></span><span style={{ fontSize: 13, fontWeight: 600 }}>Закупка 1</span></div></td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>ТаджТехСнаб</td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, textAlign: 'right', color: '#6B7370', fontFamily: PLEX }}>01 мар 2026</td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{dealTotalF}</td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', ...num, whiteSpace: 'nowrap' }}>{paidF}</td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', ...num, whiteSpace: 'nowrap' }}>{deliveredF}</td>
                  <td style={{ padding: '11px 16px 11px 12px', borderBottom: '1px solid #F3F2ED' }}><Badge b={{ t: dealStatus, fg: dSt.fg, bg: dSt.bg, dot: dSt.dot }} /></td>
                </tr>
              </tbody>
            </table></div>
          </div>
          <div style={{ fontSize: 12, color: '#8A918D', marginTop: 10, lineHeight: 1.5 }}>Сделка по закупке отслеживает частичные оплаты (сколько мы должны поставщику) и частичные поставки (сколько поставщик должен нам по товарам и услугам). Нажмите строку — откроется карточка сделки.</div>
        </div>
      )}

      {dealsView === 'card' && (
        <div>
          <div onClick={() => { setDealsView('list'); setStatusMenu(false); }} style={{ fontSize: 12.5, fontWeight: 600, color: '#5A625E', cursor: 'pointer', marginBottom: 8 }}>‹ Сделки закупок</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Закупка 1</div>
            <div style={{ flex: 1 }} />
            <div className="hv-soft" style={{ width: 34, height: 34, border: '1px solid #E0DED8', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A918D' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="2.5" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="11.5" cy="7" r="1.2" /></svg></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 14, marginBottom: 16, alignItems: 'start' }}>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '16px 18px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div><div style={{ fontSize: 11.5, color: '#8A918D', marginBottom: 3 }}>Сделка на сумму</div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', ...num }}>{dealTotalF} <span style={{ fontSize: 11, fontWeight: 500, color: '#A6ACA8', fontFamily: GOLOS }}>TJS</span></div></div>
                <div onClick={() => setStatusMenu(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E0DED8', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: dSt.fg, background: dSt.bg, cursor: 'pointer', flex: 'none' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: dSt.dot }} />{dealStatus} <span style={{ color: '#A6ACA8' }}>▾</span></div>
              </div>
              {statusMenu && (
                <div style={{ position: 'absolute', right: 16, top: 56, zIndex: 40, background: '#fff', border: '1px solid #E7E5E0', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,.14)', padding: 6, minWidth: 180 }}>
                  {statusOptions.map(o => (
                    <div key={o.t} onClick={o.onClick} className="hv-soft" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: o.dot }} /><span style={{ flex: 1 }}>{o.t}</span>{o.cur && <span style={{ color: ACC, fontWeight: 700 }}>✓</span>}</div>
                  ))}
                  <div style={{ borderTop: '1px solid #F0EFEA', marginTop: 5, padding: '8px 10px 4px' }}><div style={{ fontSize: 10.5, color: '#A6ACA8', marginBottom: 6 }}>Свой статус · цвет маркера</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#22935B', cursor: 'pointer' }} /><span style={{ width: 16, height: 16, borderRadius: '50%', background: '#C9A227', cursor: 'pointer' }} /><span style={{ width: 16, height: 16, borderRadius: '50%', background: '#3D62B3', cursor: 'pointer' }} /><span style={{ width: 16, height: 16, borderRadius: '50%', background: '#D24A3D', cursor: 'pointer' }} /><span style={{ width: 16, height: 16, borderRadius: '50%', background: '#8E5AD6', cursor: 'pointer' }} /><span style={{ width: 16, height: 16, borderRadius: '50%', background: '#C86B9E', cursor: 'pointer' }} />
                  </div></div>
                </div>
              )}
              <div style={{ borderTop: '1px solid #F0EFEA', marginTop: 13, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 78 }}>Тип</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EFEEEA', borderRadius: 6, padding: '2px 9px', fontWeight: 600 }}><CartIcon size={12} stroke="#6B7370" />Закупка</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 78 }}>Поставщик</span><span style={{ fontWeight: 600, borderBottom: '1px dashed #CFCCC4' }}>ТаджТехСнаб</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><span style={{ color: '#8A918D', width: 78 }}>Создана</span><span style={{ fontWeight: 500, borderBottom: '1px dashed #CFCCC4', fontFamily: PLEX }}>01 мар 2026</span></div>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D' }}>ВЫПЛАТЫ ПОСТАВЩИКУ</span><span onClick={() => setPayModal(true)} style={{ fontSize: 12, fontWeight: 700, color: ACC, cursor: 'pointer' }}>ДОБАВИТЬ</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 34, height: 34, borderRadius: 9, background: '#EFEEEA', color: '#8A918D', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><CoinsIcon size={17} /></span><div><div style={{ fontSize: 19, fontWeight: 700, ...num }}>{paidF} <span style={{ fontSize: 11, fontWeight: 500, color: '#A6ACA8', fontFamily: GOLOS }}>TJS</span></div><div style={{ fontSize: 11, color: '#A6ACA8', fontFamily: PLEX }}>из {dealTotalF} TJS</div></div></div>
              <div style={{ height: 6, background: '#EEF1EE', borderRadius: 99, overflow: 'hidden', margin: '11px 0 8px' }}><div style={{ height: '100%', background: ACC, width: paidPctW }} /></div>
              <div style={{ fontSize: 11.5, color: '#8A918D' }}>Оплачено: {pctI(paid) + '%'}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>Мы должны: <span style={{ color: '#B93227', ...num }}>{weOweF} TJS</span></div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D' }}>ПОСТАВКИ</span><span onClick={() => setDelivModal(true)} style={{ fontSize: 12, fontWeight: 700, color: ACC, cursor: 'pointer' }}>СОЗДАТЬ</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 34, height: 34, borderRadius: 9, background: '#EFEEEA', color: '#8A918D', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><TruckIcon size={17} /></span><div><div style={{ fontSize: 19, fontWeight: 700, ...num }}>{deliveredF} <span style={{ fontSize: 11, fontWeight: 500, color: '#A6ACA8', fontFamily: GOLOS }}>TJS</span></div><div style={{ fontSize: 11, color: '#A6ACA8', fontFamily: PLEX }}>из {dealTotalF} TJS</div></div></div>
              <div style={{ height: 6, background: '#EEF1EE', borderRadius: 99, overflow: 'hidden', margin: '11px 0 8px' }}><div style={{ height: '100%', background: ACC, width: delivPctW }} /></div>
              <div style={{ fontSize: 11.5, color: '#8A918D' }}>Отгружено: {pctI(delivered) + '%'}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>Поставщик должен: <span style={{ color: '#B25313', ...num }}>{supOweF} TJS</span></div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#8A918D', marginBottom: 12 }}>ФАЙЛЫ И КОММЕНТАРИИ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid #F3F2ED' }}><span style={{ width: 26, height: 30, borderRadius: 5, background: '#FAE7E4', color: '#B93227', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flex: 'none' }}>PDF</span><div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: ACC }}>Договор №1.pdf</div><div style={{ fontSize: 10.5, color: '#A6ACA8' }}>10 апр в 16:18</div></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0' }}><span style={{ width: 26, height: 30, borderRadius: 5, background: '#E6F4EB', color: '#1A7A4B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, flex: 'none' }}>XLSX</span><div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: ACC }}>Накладная.xlsx</div><div style={{ fontSize: 10.5, color: '#A6ACA8' }}>10 апр в 16:18</div></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E0DED8', borderRadius: 9, padding: '8px 11px', marginTop: 12 }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#A6ACA8" strokeWidth="1.5"><path d="M13 7l-5 5a3 3 0 01-4-4l5-5a2 2 0 013 3l-5 5a1 1 0 01-1-1l4-4" /></svg><input placeholder="Написать комментарий" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent' }} /></div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid #E7E5E0' }}>
              <div onClick={() => setDealTab('goods')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: tGoods.fg, background: tGoods.bg }}>Товары и услуги <span style={{ color: '#A6ACA8' }}>{posRows.length}</span></div>
              <div onClick={() => setDealTab('pay')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: tPay.fg, background: tPay.bg }}>Выплаты <span style={{ color: '#A6ACA8' }}>{payRows.length}</span></div>
              <div onClick={() => setDealTab('delivery')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: tDeliv.fg, background: tDeliv.bg }}>Поставки <span style={{ color: '#A6ACA8' }}>{delivRows.length}</span></div>
            </div>

            {dealTab === 'goods' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}><span style={{ fontSize: 12.5, color: '#8A918D' }}>Выберите товары или услуги для закупки</span><span style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Добавить товар или услугу</span></div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <Th style={{ padding: '8px 12px 8px 16px', borderTop: '1px solid #F0EFEA' }}>Наименование товара/услуги</Th>
                    <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Кол-во</Th>
                    <Th style={{ borderTop: '1px solid #F0EFEA' }}>Единица</Th>
                    <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Цена за ед.</Th>
                    <Th right style={{ borderTop: '1px solid #F0EFEA' }}>Скидка</Th>
                    <Th right style={{ padding: '8px 16px 8px 12px', borderTop: '1px solid #F0EFEA' }}>Сумма</Th>
                  </tr></thead>
                  <tbody>
                    {posRows.map(p => (
                      <tr key={p.name} className="hv-row">
                        <td style={{ padding: '11px 12px 11px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 13, fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', ...num }}>{p.qty}</td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#6B7370' }}>{p.unit}</td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', ...num }}>{p.price}</td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, textAlign: 'right', color: '#6B7370', fontFamily: PLEX }}>{p.disc}</td>
                        <td style={{ padding: '11px 16px 11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{p.sum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '11px 16px', fontSize: 12.5, color: '#6B7370' }}>{posRows.length} позиции на сумму: <b style={{ color: '#1B1F1E', marginLeft: 6, fontFamily: PLEX }}>{dealTotalF} TJS</b></div>
              </div>
            )}

            {dealTab === 'pay' && (
              <div>
                {payRows.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '44px 20px', textAlign: 'center' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: '#F1F0EB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}><CoinsIcon size={22} stroke="#8A918D" /></div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Добавьте выплаты по сделке</div>
                    <div style={{ fontSize: 12.5, color: '#8A918D', margin: '5px 0 14px', lineHeight: 1.5 }}>Учитывайте оплаты, чтобы контролировать<br />выполнение обязательств перед поставщиком</div>
                    <div onClick={() => setPayModal(true)} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Добавить</div>
                  </div>
                )}
                {payRows.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}><span style={{ fontSize: 12.5, color: '#8A918D' }}>Платежи поставщику за товары и услуги</span><span onClick={() => setPayModal(true)} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Добавить выплату</span></div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <Th style={{ padding: '8px 16px', borderTop: '1px solid #F0EFEA' }}>Дата</Th>
                        <Th style={{ borderTop: '1px solid #F0EFEA' }}>Счёт</Th>
                        <Th style={{ borderTop: '1px solid #F0EFEA' }}>Контрагент</Th>
                        <Th style={{ borderTop: '1px solid #F0EFEA' }}>Статья</Th>
                        <Th right style={{ padding: '8px 16px 8px 12px', borderTop: '1px solid #F0EFEA' }}>Сумма</Th>
                      </tr></thead>
                      <tbody>
                        {payRows.map((p, i) => (
                          <tr key={i} className="hv-row">
                            <td style={{ padding: '11px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{p.date}</td>
                            <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{p.account}</td>
                            <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{p.party}</td>
                            <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E' }}>{p.article}</td>
                            <td style={{ padding: '11px 16px 11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#B93227', ...num, whiteSpace: 'nowrap' }}>{p.sumF}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '11px 16px', fontSize: 12.5, color: '#6B7370' }}>{payRows.length} выплат на сумму: <b style={{ color: '#1B1F1E', marginLeft: 6, fontFamily: PLEX }}>{paidF} TJS</b></div>
                  </div>
                )}
              </div>
            )}

            {dealTab === 'delivery' && (
              <div>
                {delivRows.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '44px 20px', textAlign: 'center' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: '#F1F0EB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}><TruckIcon size={22} stroke="#8A918D" /></div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Добавьте поставку к сделке</div>
                    <div style={{ fontSize: 12.5, color: '#8A918D', margin: '5px 0 14px', lineHeight: 1.5 }}>Отслеживайте товары и услуги, которые<br />вам поставили ваши поставщики</div>
                    <div onClick={() => setDelivModal(true)} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Добавить</div>
                  </div>
                )}
                {delivRows.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}><span style={{ fontSize: 12.5, color: '#8A918D' }}>Полученные товары и оказанные услуги</span><span onClick={() => setDelivModal(true)} style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>+ Создать поставку</span></div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <Th style={{ padding: '8px 16px', borderTop: '1px solid #F0EFEA' }}>Дата</Th>
                        <Th style={{ borderTop: '1px solid #F0EFEA' }}>Юрлицо</Th>
                        <Th style={{ borderTop: '1px solid #F0EFEA' }}>Контрагент</Th>
                        <Th style={{ borderTop: '1px solid #F0EFEA' }}>Состав</Th>
                        <Th right style={{ padding: '8px 16px 8px 12px', borderTop: '1px solid #F0EFEA' }}>Сумма</Th>
                      </tr></thead>
                      <tbody>
                        {delivRows.map((d, i) => (
                          <tr key={i} className="hv-row">
                            <td style={{ padding: '11px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{d.date}</td>
                            <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{d.entity}</td>
                            <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{d.party}</td>
                            <td style={{ padding: '11px 12px', borderBottom: '1px solid #F3F2ED' }}><span style={{ fontSize: 11.5, fontWeight: 600, color: '#5A625E', background: '#EFEEEA', borderRadius: 6, padding: '2px 8px' }}>{d.comp}</span></td>
                            <td style={{ padding: '11px 16px 11px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', fontWeight: 600, ...num, whiteSpace: 'nowrap' }}>{d.sumF}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '11px 16px', fontSize: 12.5, color: '#6B7370' }}>{delivRows.length} поставка на сумму: <b style={{ color: '#1B1F1E', marginLeft: 6, fontFamily: PLEX }}>{deliveredF} TJS</b></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {dealModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
          <div onClick={() => setDealModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '94vw', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px', animation: 'finFade .18s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}><div style={{ fontSize: 17, fontWeight: 700 }}>Новая закупка</div><CloseBtn onClick={() => setDealModal(false)} /></div>
            <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Название сделки <span style={{ color: '#B93227' }}>*</span></div><input defaultValue="Закупка 1" style={{ width: '100%', height: 38, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 11px', fontSize: 13, outline: 'none' }} /></div>
            <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Дата сделки</div><input defaultValue="01.03.2026" style={{ width: '100%', height: 38, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 11px', fontSize: 13, outline: 'none', fontFamily: PLEX }} /></div>
            <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Поставщик</div><select style={{ width: '100%', height: 38, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 9px', fontSize: 13, background: '#fff' }}><option>ТаджТехСнаб</option><option>Сохтмон Мавод</option><option>Карго Азия</option></select></div>
            <div style={{ marginBottom: 20 }}><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Комментарий</div><textarea placeholder="Закупка по договору №1" style={{ width: '100%', height: 64, border: '1px solid #DFDCD6', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', resize: 'none' }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><div onClick={() => setDealModal(false)} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отменить</div><div onClick={createDeal} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Создать</div></div>
          </div>
        </div>
      )}

      {payModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
          <div onClick={() => setPayModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 840, maxWidth: '96vw', maxHeight: '88vh', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column', animation: 'finFade .18s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 22px', borderBottom: '1px solid #EFEEE9' }}><div style={{ fontSize: 16, fontWeight: 700 }}>Добавьте операции к сделке или <span style={{ color: ACC }}>создайте новую</span></div><div style={{ flex: 1 }} /><CloseBtn onClick={() => setPayModal(false)} /></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 22px', flexWrap: 'wrap' }}>
              <input placeholder="Поиск по операциям" style={{ width: 210, height: 34, border: '1px solid #E0DED8', borderRadius: 8, padding: '0 11px', fontSize: 12.5, outline: 'none' }} />
              <input placeholder="Дата операции" style={{ width: 150, height: 34, border: '1px solid #E0DED8', borderRadius: 8, padding: '0 11px', fontSize: 12.5, outline: 'none' }} />
              <input placeholder="Сумма от" style={{ width: 100, height: 34, border: '1px solid #E0DED8', borderRadius: 8, padding: '0 11px', fontSize: 12.5, outline: 'none' }} />
              <span style={{ color: '#A6ACA8' }}>—</span>
              <input placeholder="до" style={{ width: 90, height: 34, border: '1px solid #E0DED8', borderRadius: 8, padding: '0 11px', fontSize: 12.5, outline: 'none' }} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>Сбросить</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th style={{ padding: '8px 10px' }}>Дата</Th>
                  <Th style={{ padding: '8px 10px' }}>Счёт</Th>
                  <Th style={{ padding: '8px 10px', textAlign: 'center' }}>Тип</Th>
                  <Th style={{ padding: '8px 10px' }}>Контрагент</Th>
                  <Th style={{ padding: '8px 10px' }}>Статья</Th>
                  <Th right style={{ padding: '8px 10px' }}>Сумма</Th>
                  <th style={{ borderBottom: '1px solid #E7E5E0', width: 36 }} />
                </tr></thead>
                <tbody>
                  <tr><td colSpan={7} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#5A625E', background: '#FAFAF8', borderBottom: '1px solid #F3F2ED' }}>Можно прикрепить к сделке</td></tr>
                  {attachOps.map((o, i) => (
                    <tr key={i} className="hv-row">
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#3E4643', fontFamily: PLEX, whiteSpace: 'nowrap' }}>{o.date}</td>
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', fontSize: 12.5, whiteSpace: 'nowrap' }}>{o.account}</td>
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', textAlign: 'center' }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#C86B5E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10" /><path d="M9.5 4.5L13 8l-3.5 3.5" /></svg></td>
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{o.party}</td>
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E' }}>{o.article}</td>
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#B93227', ...num, whiteSpace: 'nowrap' }}>{o.sumF}</td>
                      <td style={{ padding: 10, borderBottom: '1px solid #F3F2ED', textAlign: 'center' }}><div onClick={o.onAdd} title="Прикрепить" className="hv-acc" style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: ACC }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 3v10M3 8h10" /></svg></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid #EFEEE9' }}><span style={{ fontSize: 13, color: '#5A625E' }}>Сумма выплат в сделке: <b style={{ color: '#1B1F1E', fontFamily: PLEX }}>{paidF} TJS</b></span><div style={{ flex: 1 }} /><div onClick={() => setPayModal(false)} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Закрыть</div></div>
          </div>
        </div>
      )}

      {delivModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
          <div onClick={() => setDelivModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 620, maxWidth: '96vw', maxHeight: '90vh', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column', animation: 'finFade .18s ease' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '18px 22px', borderBottom: '1px solid #EFEEE9' }}><div><div style={{ fontSize: 16, fontWeight: 700 }}>Создание поставки</div><div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>Сделка: <span style={{ color: ACC }}>Закупка 1</span></div></div><div style={{ flex: 1 }} /><CloseBtn onClick={() => setDelivModal(false)} /></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Дата поставки <span style={{ color: '#B93227' }}>*</span></div><input defaultValue="14.07.2025" style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: PLEX }} /></div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}><span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid #CFCCC4', display: 'inline-block' }} />Плановая поставка</label></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Юрлицо <span style={{ color: '#B93227' }}>*</span></div><select style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' }}><option>ООО «Насб Пайванд»</option><option>ИП Рахимов Р.</option></select></div>
                <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Поставщик <span style={{ color: '#B93227' }}>*</span></div><select style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' }}><option>ТаджТехСнаб</option></select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Статья закупки товаров</div><select style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' }}><option>Запасы</option><option>Оборудование</option></select></div>
                <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Статья закупки услуг</div><select style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' }}><option>Транспортные расходы</option><option>Монтажные работы</option></select></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12.5, color: '#8A918D' }}>Товары/услуги для поставки</span><span style={{ fontSize: 12.5, fontWeight: 600, color: ACC, cursor: 'pointer' }}>Заполнить позициями из сделки</span></div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #EFEDE8', borderRadius: 8 }}>
                <thead><tr>
                  <Th style={{ padding: '7px 10px', fontSize: 10, letterSpacing: '.04em', borderBottom: '1px solid #EFEDE8' }}>Наименование</Th>
                  <Th right style={{ padding: '7px 10px', fontSize: 10, letterSpacing: '.04em', borderBottom: '1px solid #EFEDE8' }}>Кол-во</Th>
                  <Th right style={{ padding: '7px 10px', fontSize: 10, letterSpacing: '.04em', borderBottom: '1px solid #EFEDE8' }}>Цена</Th>
                  <Th right style={{ padding: '7px 10px', fontSize: 10, letterSpacing: '.04em', borderBottom: '1px solid #EFEDE8' }}>Сумма</Th>
                </tr></thead>
                <tbody>
                  <tr><td style={{ padding: '9px 10px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, fontWeight: 600 }}>Кабель UTP cat.6</td><td style={{ padding: '9px 10px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, textAlign: 'right', fontFamily: PLEX }}>30 шт.</td><td style={{ padding: '9px 10px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, textAlign: 'right', fontFamily: PLEX }}>300</td><td style={{ padding: '9px 10px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, textAlign: 'right', fontWeight: 600, fontFamily: PLEX }}>9 000</td></tr>
                  <tr><td style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 600 }}>Пусконаладка СКС</td><td style={{ padding: '9px 10px', fontSize: 12.5, textAlign: 'right', fontFamily: PLEX }}>2 ч.</td><td style={{ padding: '9px 10px', fontSize: 12.5, textAlign: 'right', fontFamily: PLEX }}>500</td><td style={{ padding: '9px 10px', fontSize: 12.5, textAlign: 'right', fontWeight: 600, fontFamily: PLEX }}>950</td></tr>
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '9px 2px', fontSize: 12.5, color: '#6B7370' }}>Сумма отгрузки: <b style={{ color: '#1B1F1E', marginLeft: 6, fontFamily: PLEX }}>9 950 TJS</b></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #EFEEE9' }}><div onClick={() => setDelivModal(false)} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отменить</div><div onClick={saveDelivery} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Сохранить</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
