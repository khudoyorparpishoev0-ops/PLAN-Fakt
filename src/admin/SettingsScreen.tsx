import { ACC, SOFT, PLEX } from '../theme';
import { badge } from '../lib/badges';
import { SETTINGS_NAV, USERS } from '../data/admin';
import { Badge, Th, AccentBtn } from '../components/ui';

export interface SettingsScreenProps {
  setTab: string;
  setSetTab: (t: string) => void;
}

export default function SettingsScreen(props: SettingsScreenProps) {
  const { setTab, setSetTab } = props;
  const setNav = SETTINGS_NAV.map(([id, t]) => ({
    id, t,
    fw: setTab === id ? 600 : 400,
    fg: id === 'delete' ? '#B93227' : setTab === id ? ACC : '#3E4643',
    bg: setTab === id ? SOFT : 'transparent',
  }));
  const usersRows = USERS.map(u => ({ ...u, b: badge(u.status, u.status === 'Активен' ? 'green' : 'yellow') }));
  const setOtherTitle = (SETTINGS_NAV.find(x => x[0] === setTab) || ['', ''])[1];

  return (
    <div data-screen-label="Настройки" style={{ display: 'grid', gridTemplateColumns: '232px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', padding: '8px 10px 6px' }}>НАСТРОЙКИ</div>
        {setNav.map(n => (
          <div key={n.id} onClick={() => setSetTab(n.id)} className="hv-soft" style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: n.fw, color: n.fg, background: n.bg }}>{n.t}</div>
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        {setTab === 'profile' && (
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '20px 22px', maxWidth: 620 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid #F3F2ED', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>РР</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Рустам Рахимов</div>
                <div style={{ fontSize: 12, color: '#8A918D' }}>Руководитель · администратор системы</div>
              </div>
              <div style={{ flex: 1 }} />
              <Badge b={badge('Активен', 'green')} />
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', marginBottom: 10 }}>ТЕЛЕФОН И ТЕЛЕГРАМ-БОТ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14, alignItems: 'start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Телефон</div>
                <input defaultValue="+992 93 505-40-10" style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none', fontFamily: PLEX }} />
              </div>
              <div style={{ fontSize: 11.5, color: '#8A918D', lineHeight: 1.5, paddingTop: 21 }}>Номер используется для привязки Телеграм-бота — быстрое внесение доходов и расходов из чата.</div>
            </div>
            <div style={{ background: '#FAE7E4', border: '1px solid #F0CFC9', borderRadius: 9, padding: '9px 12px', fontSize: 12, color: '#B93227', lineHeight: 1.5, marginBottom: 18 }}>Этот номер уже привязан к другой учётной записи — подключить Телеграм-бота не получится. Укажите другой номер.</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', marginBottom: 10 }}>СМЕНА ПАРОЛЯ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Текущий пароль</div><input type="password" placeholder="••••••••" style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' }} /></div>
              <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Новый пароль</div><input type="password" placeholder="Минимум 8 символов" style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' }} /></div>
              <div><div style={{ fontSize: 12, color: '#6B7370', marginBottom: 4 }}>Повторите пароль</div><input type="password" placeholder="Ещё раз новый пароль" style={{ width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <div className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Сохранить изменения</div>
              <div className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отмена</div>
            </div>
          </div>
        )}
        {setTab === 'users' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#5A625E' }}>Учётная запись создаётся для каждого сотрудника. Роли и права назначает администратор.</div>
              <div style={{ flex: 1 }} />
              <AccentBtn style={{ padding: '8px 15px' }}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Пользователь</AccentBtn>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th style={{ padding: '8px 12px 8px 16px' }}>Пользователь</Th>
                  <Th>Роль</Th>
                  <Th>Доступ</Th>
                  <Th style={{ padding: '8px 16px 8px 12px' }}>Статус</Th>
                </tr></thead>
                <tbody>
                  {usersRows.map(u => (
                    <tr key={u.name} className="hv-row">
                      <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid #F3F2ED' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: '50%', background: SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flex: 'none' }}>{u.init}</div><div><div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div><div style={{ fontSize: 11.5, color: '#8A918D', fontFamily: PLEX }}>{u.phone}</div></div></div></td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, fontWeight: 600 }}>{u.role}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #F3F2ED', fontSize: 12.5, color: '#5A625E' }}>{u.access}</td>
                      <td style={{ padding: '10px 16px 10px 12px', borderBottom: '1px solid #F3F2ED' }}><Badge b={u.b} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {setTab !== 'profile' && setTab !== 'users' && (
          <div style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 12, padding: '48px 30px', textAlign: 'center', maxWidth: 620 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EFEEE9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 13px' }}><svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="#8A918D" strokeWidth="1.5"><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.6 3.6l1.35 1.35M11.05 11.05l1.35 1.35M12.4 3.6l-1.35 1.35M4.95 11.05L3.6 12.4" /></svg></div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{setOtherTitle}</div>
            <div style={{ fontSize: 12.5, color: '#8A918D', marginTop: 5, lineHeight: 1.5 }}>Раздел в разработке — появится на этапе 2.</div>
          </div>
        )}
      </div>
    </div>
  );
}
