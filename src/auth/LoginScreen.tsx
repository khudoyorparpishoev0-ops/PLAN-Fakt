import { useState, type CSSProperties, type FormEvent } from 'react';
import { ACC } from '../theme';
import { Logo } from '../components/ui';
import { api, ApiError, type Session } from '../lib/api';

const LAB: CSSProperties = { fontSize: 12.5, color: '#5A625E', fontWeight: 500, marginBottom: 7, display: 'block' };
const INP: CSSProperties = { width: '100%', height: 44, border: '1px solid #DFDCD6', borderRadius: 10, padding: '0 13px', fontSize: 13.5, background: '#fff', outline: 'none' };

export interface LoginScreenProps {
  /** Успешный вход: сессия + пароль в памяти (для форсированной смены). */
  onLogin: (session: Session, password: string) => void;
}

/** Экран входа — вход по email и паролю (JWT, роль определяет интерфейс). */
export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = email.trim().length > 3 && password.length > 0 && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.login(email.trim(), password);
      onLogin(session, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти. Попробуйте ещё раз.');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#EEF1EE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontSize: 14 }}>
      <div style={{ width: 400, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 22 }}>
          <Logo size={40} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '.03em' }}>IT-HONA</div>
            <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>Финансы · План-Факт</div>
          </div>
        </div>
        <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E7E5E0', borderRadius: 14, padding: '26px 28px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>Вход в систему</div>
          <div style={{ marginBottom: 14 }}>
            <label style={LAB}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@it-hona.tj" autoComplete="username" autoFocus style={INP}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={LAB}>Пароль</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" style={INP}
            />
          </div>
          {error && <div style={{ fontSize: 12.5, color: '#B93227', marginTop: 8 }}>{error}</div>}
          <button
            type="submit" disabled={!valid}
            style={{
              width: '100%', height: 48, borderRadius: 11, border: 'none', marginTop: 18,
              background: ACC, color: '#fff', fontSize: 14.5, fontWeight: 600, fontFamily: 'inherit',
              cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }),
            }}
            className={valid ? 'hv-dim' : undefined}
          >
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </form>
        <div style={{ fontSize: 11.5, color: '#A6ACA8', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
          Интерфейс определяется ролью учётной записи.<br />
          Тестовые: admin@ · director@ · accountant@it-hona.tj
        </div>
      </div>
    </div>
  );
}
