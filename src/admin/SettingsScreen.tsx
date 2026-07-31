import { useEffect, useState, type CSSProperties } from 'react';
import { ACC, SOFT, PLEX } from '../theme';
import { badge } from '../lib/badges';
import { fmt } from '../lib/format';
import { SETTINGS_NAV } from '../data/admin';
import { initials } from '../lib/compute';
import {
  api, ApiError, ROLE_LABELS,
  type ApiAuditRow, type ApiRate, type ApiUser, type AuthUser, type RoleCode,
} from '../lib/api';
import { Badge, Th, AccentBtn } from '../components/ui';
import { useIsMobile } from '../lib/responsive';

export interface SettingsScreenProps {
  setTab: string;
  setSetTab: (t: string) => void;
  user?: AuthUser;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };
const secHead: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', marginBottom: 10 };
const cardS: CSSProperties = { background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '20px 22px', maxWidth: 620 };
const primaryBtn: CSSProperties = { background: ACC, color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

/** Текст «Доступ» по роли (колонка экрана «Пользователи»). */
const ACCESS_BY_ROLE: Record<string, string> = {
  admin: 'Полный доступ, согласование заявок',
  director: 'Согласование заявок, отчёты',
  accountant: 'Кабинет: заявки на оплату и авто',
};

const ACTION_RU: Record<string, string> = {
  create: 'создание', update: 'изменение', delete: 'удаление',
  status_change: 'смена статуса', storno: 'сторнирование',
  archive: 'в архив', unarchive: 'из архива', set: 'установка',
};
const ENTITY_RU: Record<string, string> = {
  request: 'Заявка', operation: 'Операция', user: 'Пользователь',
  project: 'Проект', exchange_rate: 'Курс валюты',
};

/* ── Модалка «Новый пользователь» ── */
function CreateUserModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (u: ApiUser, tempPassword: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RoleCode>('accountant');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim()) && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createUser({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role });
      onCreated(res.user, res.tempPassword);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать пользователя');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 420, maxWidth: '94vw', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px', animation: 'finFade .18s ease' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Новый пользователь</div>
        <div style={{ marginBottom: 10 }}><div style={lbl}>Имя</div><input value={name} onChange={e => setName(e.target.value)} placeholder="Фамилия Имя" style={inp} /></div>
        <div style={{ marginBottom: 10 }}><div style={lbl}>Email (логин)</div><input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@it-hona.tj" style={inp} /></div>
        <div style={{ marginBottom: 10 }}><div style={lbl}>Телефон</div><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+992 …" style={{ ...inp, fontFamily: PLEX }} /></div>
        <div style={{ marginBottom: 16 }}>
          <div style={lbl}>Роль</div>
          <select value={role} onChange={e => setRole(e.target.value as RoleCode)} style={{ ...inp, padding: '0 8px' }}>
            <option value="accountant">Операционный бухгалтер</option>
            <option value="director">Директор</option>
            <option value="admin">Руководитель / админ</option>
          </select>
        </div>
        {error && <div style={{ fontSize: 12, color: '#B93227', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отмена</div>
          <div onClick={valid ? submit : undefined} className={valid ? 'hv-dim' : undefined}
            style={{ ...primaryBtn, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}>
            {busy ? 'Создаём…' : 'Создать'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsScreen(props: SettingsScreenProps) {
  const { setTab, setSetTab, user } = props;
  const isMobile = useIsMobile();
  const setNav = SETTINGS_NAV.map(([id, t]) => ({
    id, t,
    fw: setTab === id ? 600 : 400,
    fg: id === 'delete' ? '#B93227' : setTab === id ? ACC : '#3E4643',
    bg: setTab === id ? SOFT : 'transparent',
  }));
  const setOtherTitle = (SETTINGS_NAV.find(x => x[0] === setTab) || ['', ''])[1];
  const [notice, setNotice] = useState<string | null>(null);

  /* ── Пользователи ── */
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [tempPwd, setTempPwd] = useState<{ email: string; password: string } | null>(null);
  const loadUsers = () => api.users().then(r => setUsers(r.items)).catch(() => {});
  useEffect(() => { if (setTab === 'users') void loadUsers(); }, [setTab]);

  const toggleActive = async (u: ApiUser) => {
    try {
      await api.updateUser(u.id, { active: !u.active });
      void loadUsers();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Не удалось изменить пользователя');
    }
  };

  /* ── Общие настройки: ставка км ── */
  const [kmRateStr, setKmRateStr] = useState('');
  useEffect(() => {
    if (setTab === 'general') {
      api.settings().then(s => setKmRateStr(s.kmRate ? String(s.kmRate).replace('.', ',') : '0')).catch(() => {});
    }
  }, [setTab]);
  const saveKmRate = async () => {
    const v = parseFloat(kmRateStr.trim().replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { setNotice('Ставка — неотрицательное число'); return; }
    try {
      await api.updateSettings(v);
      setNotice('Ставка сохранена. Поездки теперь ' + (v > 0 ? `считаются по ${kmRateStr} TJS/км` : 'показываются в километрах'));
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Не удалось сохранить (нужна роль администратора)');
    }
  };

  /* ── Курсы валют ── */
  const [rates, setRates] = useState<ApiRate[]>([]);
  const [rCur, setRCur] = useState('USD');
  const [rDate, setRDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rVal, setRVal] = useState('');
  const loadRates = () => api.rates().then(setRates).catch(() => {});
  useEffect(() => { if (setTab === 'rates') void loadRates(); }, [setTab]);
  const addRate = async () => {
    const v = parseFloat(rVal.trim().replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setNotice('Курс — число больше нуля'); return; }
    try {
      await api.addRate(rCur, rDate, v);
      setRVal('');
      void loadRates();
      setNotice(`Курс ${rCur} на ${rDate} сохранён`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Не удалось сохранить курс (нужна роль администратора)');
    }
  };

  /* ── История действий ── */
  const [audit, setAudit] = useState<ApiAuditRow[]>([]);
  useEffect(() => { if (setTab === 'history') api.audit(100).then(setAudit).catch(() => {}); }, [setTab]);

  /* ── Профиль: смена пароля ── */
  const [pwdCur, setPwdCur] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdRep, setPwdRep] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const pwdValid = pwdCur.length > 0 && pwdNew.length >= 8 && pwdRep === pwdNew && !pwdBusy && !!props.onChangePassword;
  const savePassword = async () => {
    if (!pwdValid) return;
    setPwdBusy(true);
    try {
      await props.onChangePassword!(pwdCur, pwdNew);
      setPwdCur(''); setPwdNew(''); setPwdRep('');
      setNotice('Пароль обновлён');
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Не удалось сменить пароль');
    } finally {
      setPwdBusy(false);
    }
  };

  const usersRows = users.map(u => ({
    id: u.id,
    init: initials(u.name),
    name: u.name,
    phone: u.phone ?? '—',
    role: ROLE_LABELS[u.role.code] ?? u.role.name,
    access: ACCESS_BY_ROLE[u.role.code] ?? '—',
    email: u.email,
    active: u.active,
    temp: u.mustChangePassword,
    b: u.active ? badge('Активен', 'green') : badge('Заблокирован', 'red'),
  }));

  useEffect(() => {
    if (notice == null) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div data-screen-label="Настройки" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '232px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', padding: '8px 10px 6px' }}>НАСТРОЙКИ</div>
        {setNav.map(n => (
          <div key={n.id} onClick={() => setSetTab(n.id)} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: n.fw, color: n.fg, background: n.bg }}>{n.t}</div>
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        {setTab === 'profile' && (
          <div style={cardS}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid #F3F2ED', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>{user ? initials(user.name) : 'РР'}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{user?.name ?? '—'}</div>
                <div style={{ fontSize: 12, color: '#8A918D' }}>{user ? ROLE_LABELS[user.role] : ''} · {user?.email}</div>
              </div>
              <div style={{ flex: 1 }} />
              <Badge b={badge('Активен', 'green')} />
            </div>
            <div style={secHead}>ТЕЛЕФОН И ТЕЛЕГРАМ-БОТ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14, alignItems: 'start', marginBottom: 18 }}>
              <div>
                <div style={lbl}>Телефон</div>
                <input defaultValue="+992 93 505-40-10" style={{ ...inp, fontFamily: PLEX }} />
              </div>
              <div style={{ fontSize: 11.5, color: '#8A918D', lineHeight: 1.5, paddingTop: 21 }}>Номер используется для привязки Телеграм-бота — быстрое внесение доходов и расходов из чата (этап 2).</div>
            </div>
            <div style={secHead}>СМЕНА ПАРОЛЯ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              <div><div style={lbl}>Текущий пароль</div><input type="password" value={pwdCur} onChange={e => setPwdCur(e.target.value)} placeholder="••••••••" style={inp} /></div>
              <div><div style={lbl}>Новый пароль</div><input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} placeholder="Минимум 8 символов" style={inp} /></div>
              <div>
                <div style={lbl}>Повторите пароль</div><input type="password" value={pwdRep} onChange={e => setPwdRep(e.target.value)} placeholder="Ещё раз новый пароль" style={inp} />
                {pwdRep.length > 0 && pwdRep !== pwdNew && <div style={{ fontSize: 11.5, color: '#B93227', marginTop: 4 }}>Пароли не совпадают</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <div onClick={pwdValid ? savePassword : undefined} className={pwdValid ? 'hv-dim' : undefined}
                style={{ ...primaryBtn, cursor: pwdValid ? 'pointer' : 'default', ...(pwdValid ? {} : { opacity: 0.45 }) }}>
                {pwdBusy ? 'Сохраняем…' : 'Сохранить изменения'}
              </div>
              <div onClick={() => { setPwdCur(''); setPwdNew(''); setPwdRep(''); }} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отмена</div>
            </div>
          </div>
        )}
        {setTab === 'general' && (
          <div style={cardS}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Общие настройки</div>
            <div style={{ fontSize: 12.5, color: '#8A918D', marginBottom: 18 }}>Валюта учёта — сомони (TJS). Часовой пояс — Asia/Dushanbe.</div>
            <div style={secHead}>КОМПЕНСАЦИЯ ПОЕЗДОК</div>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14, alignItems: 'start' }}>
              <div>
                <div style={lbl}>Ставка, TJS за км</div>
                <input value={kmRateStr} onChange={e => setKmRateStr(e.target.value)} placeholder="0" style={{ ...inp, textAlign: 'right', fontFamily: PLEX }} />
              </div>
              <div style={{ fontSize: 11.5, color: '#8A918D', lineHeight: 1.5, paddingTop: 21 }}>
                Пока ставка равна 0, поездки показываются в километрах, а не в деньгах
                (решение заказчика). Ставка применяется к НОВЫМ одобрениям поездок.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <div onClick={saveKmRate} className="hv-dim" style={primaryBtn}>Сохранить</div>
            </div>
          </div>
        )}
        {setTab === 'users' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#5A625E' }}>Учётная запись создаётся для каждого сотрудника. Роли и права назначает администратор.</div>
              <div style={{ flex: 1 }} />
              <AccentBtn style={{ padding: '8px 15px' }} onClick={() => setCreateOpen(true)}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Пользователь</AccentBtn>
            </div>
            {tempPwd && (
              <div style={{ background: '#E4F3E9', border: '1px solid #BFE3CC', borderRadius: 10, padding: '11px 14px', marginBottom: 12, fontSize: 12.5, lineHeight: 1.6 }}>
                Пользователь <b>{tempPwd.email}</b> создан. Временный пароль (показывается один раз, при входе потребуется смена):
                {' '}<b style={{ fontFamily: "'IBM Plex Sans',monospace" }}>{tempPwd.password}</b>
                <span onClick={() => setTempPwd(null)} style={{ float: 'right', cursor: 'pointer', color: '#1A7A4B', fontWeight: 700 }}>✕</span>
              </div>
            )}
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th style={{ padding: '8px 12px 8px 16px' }}>Пользователь</Th>
                  <Th>Роль</Th>
                  <Th>Доступ</Th>
                  <Th>Статус</Th>
                  <Th style={{ padding: '8px 16px 8px 12px' }}>Действия</Th>
                </tr></thead>
                <tbody>
                  {usersRows.map(u => (
                    <tr key={u.id} className="hv-row">
                      <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: '50%', background: SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flex: 'none' }}>{u.init}</div><div><div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div><div style={{ fontSize: 11.5, color: '#8A918D', fontFamily: PLEX }}>{u.email} · {u.phone}</div></div></div></td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, fontWeight: 600 }}>{u.role}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E' }}>{u.access}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED' }}>
                        <Badge b={u.b} />
                        {u.temp && <div style={{ fontSize: 10.5, color: '#8A6A00', marginTop: 3 }}>временный пароль</div>}
                      </td>
                      <td style={{ padding: '10px 16px 10px 12px', borderBottom: '1px solid #F3F2ED' }}>
                        <span
                          onClick={() => void toggleActive(users.find(x => x.id === u.id)!)}
                          className={u.active ? 'hv-red' : 'hv-soft'}
                          style={{ display: 'inline-block', border: u.active ? '1px solid #F0CFC9' : '1px solid #E0DED8', color: u.active ? '#B93227' : '#3E4643', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {u.active ? 'Заблокировать' : 'Разблокировать'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {setTab === 'rates' && (
          <div style={{ ...cardS, maxWidth: 720 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Курсы валют</div>
            <div style={{ fontSize: 12.5, color: '#8A918D', marginBottom: 16 }}>Курс к сомони на дату. Используется при одобрении валютных заявок и вводе операций.</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
              <thead><tr>
                <Th style={{ padding: '8px 12px 8px 0' }}>Валюта</Th>
                <Th right>Последний курс</Th>
                <Th right style={{ padding: '8px 0 8px 12px' }}>На дату</Th>
              </tr></thead>
              <tbody>
                {rates.map(r => (
                  <tr key={r.code}>
                    <td style={{ padding: '8px 12px 8px 0', borderBottom: '1px solid #F3F2ED', fontSize: 13 }}><b>{r.code}</b> · {r.name}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 13, textAlign: 'right', fontFamily: PLEX }}>{r.rate != null ? fmt(r.rate) : '—'}</td>
                    <td style={{ padding: '8px 0 8px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, textAlign: 'right', color: '#6B7370', fontFamily: PLEX }}>{r.rateDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={secHead}>ДОБАВИТЬ КУРС</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><div style={lbl}>Валюта</div>
                <select value={rCur} onChange={e => setRCur(e.target.value)} style={{ ...inp, width: 110, padding: '0 8px' }}>
                  <option>USD</option><option>EUR</option><option>RUB</option><option>CNY</option>
                </select>
              </div>
              <div><div style={lbl}>Дата</div><input type="date" value={rDate} onChange={e => setRDate(e.target.value)} style={{ ...inp, width: 160, fontFamily: PLEX }} /></div>
              <div><div style={lbl}>Курс к TJS</div><input value={rVal} onChange={e => setRVal(e.target.value)} placeholder="10,85" style={{ ...inp, width: 120, textAlign: 'right', fontFamily: PLEX }} /></div>
              <div onClick={addRate} className="hv-dim" style={primaryBtn}>Сохранить</div>
            </div>
          </div>
        )}
        {setTab === 'history' && (
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid #F0EFEA' }}>История действий <span style={{ fontWeight: 500, color: '#8A918D', fontSize: 12 }}>· аудит-лог (кто, что, когда)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th style={{ padding: '8px 12px 8px 16px' }}>Когда</Th>
                <Th>Пользователь</Th>
                <Th>Объект</Th>
                <Th style={{ padding: '8px 16px 8px 12px' }}>Действие</Th>
              </tr></thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id} className="hv-row">
                    <td style={{ padding: '8px 12px 8px 16px', borderBottom: '1px solid #F3F2ED', fontSize: 12, color: '#5A625E', whiteSpace: 'nowrap', fontFamily: PLEX }}>{a.at.slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{a.user}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5 }}>{ENTITY_RU[a.entity] ?? a.entity} <span style={{ color: '#A6ACA8', fontFamily: PLEX }}>#{a.entityId}</span></td>
                    <td style={{ padding: '8px 16px 8px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E' }}>{ACTION_RU[a.action] ?? a.action}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={4} style={{ padding: 16, fontSize: 12.5, color: '#A6ACA8', textAlign: 'center' }}>Записей пока нет</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {!['profile', 'users', 'general', 'rates', 'history'].includes(setTab) && (
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '48px 30px', textAlign: 'center', maxWidth: 620 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EFEEE9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 13px' }}><svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="#8A918D" strokeWidth="1.5"><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.6 3.6l1.35 1.35M11.05 11.05l1.35 1.35M12.4 3.6l-1.35 1.35M4.95 11.05L3.6 12.4" /></svg></div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{setOtherTitle}</div>
            <div style={{ fontSize: 12.5, color: '#8A918D', marginTop: 5, lineHeight: 1.5 }}>Раздел в разработке — появится на этапе 2.</div>
          </div>
        )}
      </div>
      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={(u, password) => { setCreateOpen(false); setTempPwd({ email: u.email, password }); void loadUsers(); }}
        />
      )}
      {notice && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: '#1B1F1E', color: '#fff', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 28px rgba(0,0,0,.24)', animation: 'finFade .18s ease' }}>
          {notice}
        </div>
      )}
    </div>
  );
}
