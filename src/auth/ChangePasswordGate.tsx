import { useState, type CSSProperties, type FormEvent } from 'react';
import { ACC } from '../theme';
import { Logo } from '../components/ui';
import { api, ApiError, type Session } from '../lib/api';

const LAB: CSSProperties = { fontSize: 12.5, color: 'var(--fin-text-2)', fontWeight: 500, marginBottom: 7, display: 'block' };
const INP: CSSProperties = { width: '100%', height: 44, border: '1px solid var(--fin-border)', borderRadius: 10, padding: '0 13px', fontSize: 13.5, background: 'var(--fin-surface)', outline: 'none' };

export interface ChangePasswordGateProps {
  session: Session;
  /** Пароль, введённый при входе (в памяти) — подставляется в «текущий». */
  initialCurrent?: string;
  onChanged: (session: Session) => void;
  onLogout: () => void;
}

/** Форсированная смена временного пароля: пока must_change_password = true,
 *  сервер не пускает дальше (403 password_change_required) — экран нельзя обойти. */
export default function ChangePasswordGate({ session, initialCurrent, onChanged, onLogout }: ChangePasswordGateProps) {
  const [current, setCurrent] = useState(initialCurrent ?? '');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = repeat.length > 0 && repeat !== next;
  const valid = current.length > 0 && next.length >= 8 && repeat === next && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await api.changePassword(session.accessToken, current, next);
      onChanged(fresh);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить пароль.');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fin-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontSize: 14 }}>
      <div style={{ width: 420, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 22 }}>
          <Logo size={40} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '.03em' }}>IT-HONA</div>
            <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>Финансы · План-Факт</div>
          </div>
        </div>
        <form onSubmit={submit} style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 14, padding: '26px 28px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Смените временный пароль</div>
          <div style={{ fontSize: 12.5, color: 'var(--fin-text-4)', lineHeight: 1.55, marginBottom: 18 }}>
            {session.user.name}, ваш пароль задан администратором и является временным.
            Задайте собственный пароль, чтобы продолжить.
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LAB}>Текущий (временный) пароль</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" style={INP} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LAB}>Новый пароль</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Минимум 8 символов" autoComplete="new-password" style={INP} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={LAB}>Повторите новый пароль</label>
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="Ещё раз новый пароль" autoComplete="new-password" style={INP} />
            {mismatch && <div style={{ fontSize: 11.5, color: 'var(--fin-minus)', marginTop: 4 }}>Пароли не совпадают</div>}
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--fin-minus)', marginTop: 8 }}>{error}</div>}
          <button
            type="submit" disabled={!valid}
            style={{
              width: '100%', height: 48, borderRadius: 11, border: 'none', marginTop: 18,
              background: ACC, color: 'var(--fin-surface)', fontSize: 14.5, fontWeight: 600, fontFamily: 'inherit',
              cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }),
            }}
            className={valid ? 'hv-dim' : undefined}
          >
            {busy ? 'Сохраняем…' : 'Сменить пароль и продолжить'}
          </button>
        </form>
        <div onClick={onLogout} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fin-text-2)', textAlign: 'center', marginTop: 14, cursor: 'pointer' }}>
          ← Выйти и войти другой учётной записью
        </div>
      </div>
    </div>
  );
}
