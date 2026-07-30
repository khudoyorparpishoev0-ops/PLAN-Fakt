import { useEffect, useRef, useState } from 'react';
import AdminApp from './admin/AdminApp';
import CabinetApp from './cabinet/CabinetApp';
import LoginScreen from './auth/LoginScreen';
import ChangePasswordGate from './auth/ChangePasswordGate';
import { api, bindApiSession, clearSession, loadSession, saveSession, type Session } from './lib/api';

type Phase = 'restoring' | 'login' | 'app';

/** Точка входа: настоящий вход по логину/паролю. Интерфейс определяется ролью
 *  из JWT: admin и director — админ-панель, accountant — кабинет бухгалтера.
 *  Данные экранов загружаются с API (ШАГ 3). */
export default function App() {
  const [phase, setPhase] = useState<Phase>('restoring');
  const [session, setSession] = useState<Session | null>(null);
  // Пароль, введённый при входе, — только в памяти, для формы форсированной смены
  const loginPassword = useRef<string | undefined>(undefined);

  useEffect(() => {
    const stored = loadSession();
    if (!stored) { setPhase('login'); return; }
    (async () => {
      try {
        const user = await api.me(stored.accessToken);
        const s = { ...stored, user };
        saveSession(s); setSession(s); setPhase('app');
      } catch {
        try {
          const s = await api.refresh(stored.refreshToken);
          saveSession(s); setSession(s); setPhase('app');
        } catch {
          clearSession(); setPhase('login');
        }
      }
    })();
  }, []);

  const handleLogout = () => {
    loginPassword.current = undefined;
    clearSession(); setSession(null); setPhase('login');
  };

  // Запросы данных используют активную сессию; при невосстановимом 401 — на вход
  useEffect(() => {
    bindApiSession(session, handleLogout);
  }, [session]);

  const handleLogin = (s: Session, password: string) => {
    loginPassword.current = password;
    saveSession(s); setSession(s); setPhase('app');
  };

  const handleSessionUpdate = (s: Session) => {
    saveSession(s); setSession(s);
  };

  /** Смена пароля из интерфейса (модалка кабинета): обновляет сессию. */
  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!session) throw new Error('Нет сессии');
    const fresh = await api.changePassword(session.accessToken, currentPassword, newPassword);
    handleSessionUpdate(fresh);
  };

  if (phase === 'restoring') {
    return <div style={{ minHeight: '100vh', background: '#EEF1EE' }} />;
  }
  if (phase === 'login' || !session) {
    return <LoginScreen onLogin={handleLogin} />;
  }
  if (session.user.mustChangePassword) {
    return (
      <ChangePasswordGate
        session={session}
        initialCurrent={loginPassword.current}
        onChanged={handleSessionUpdate}
        onLogout={handleLogout}
      />
    );
  }
  return session.user.role === 'accountant' ? (
    <CabinetApp user={session.user} onLogout={handleLogout} onChangePassword={changePassword} />
  ) : (
    <AdminApp user={session.user} onLogout={handleLogout} />
  );
}
