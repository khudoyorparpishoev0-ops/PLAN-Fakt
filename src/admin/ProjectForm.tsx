import { useState, type CSSProperties } from 'react';
import { ACC, PLEX } from '../theme';
import { api, ApiError, type ProjectPayload } from '../lib/api';

export interface ProjectFormProps {
  /** id — правка существующего проекта, иначе создание. */
  id?: number;
  initial?: Partial<ProjectPayload>;
  groups: string[];
  onClose: () => void;
  onSaved: () => void;
}

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };

/** Форма проекта: создание и правка карточки (название, группа,
 *  ответственный, статус, сроки). Статус «Завершён» ставится вручную —
 *  «Плановый» и «В работе» система выставляет по фактическим платежам. */
export default function ProjectForm({ id, initial, groups, onClose, onSaved }: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [group, setGroup] = useState(initial?.group ?? (groups[0] ?? ''));
  const [resp, setResp] = useState(initial?.resp ?? '');
  const [status, setStatus] = useState<'plan' | 'work' | 'done'>(initial?.status ?? 'plan');
  const [start, setStart] = useState(initial?.start ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2 && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const payload: ProjectPayload = {
      name: name.trim(),
      group: group.trim(),
      resp: resp.trim(),
      status,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    };
    try {
      if (id != null) await api.updateProject(id, payload);
      else await api.createProject(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить проект');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '94vw', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px', animation: 'finFade .18s ease' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{id != null ? 'Изменить проект' : 'Новый проект'}</div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Название</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Например, Насосная станция Вахдат" autoFocus style={inp} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={lbl}>Группа проектов</div>
            <input value={group} onChange={e => setGroup(e.target.value)} list="prj-groups" placeholder="Монтажные проекты" style={inp} />
            <datalist id="prj-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
          </div>
          <div>
            <div style={lbl}>Ответственный</div>
            <input value={resp} onChange={e => setResp(e.target.value)} placeholder="А. Хакимов" style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={lbl}>Статус</div>
            <select value={status} onChange={e => setStatus(e.target.value as 'plan' | 'work' | 'done')} style={{ ...inp, padding: '0 8px' }}>
              <option value="plan">Плановый</option>
              <option value="work">В работе</option>
              <option value="done">Завершён</option>
            </select>
          </div>
          <div>
            <div style={lbl}>Начало</div>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...inp, fontFamily: PLEX }} />
          </div>
          <div>
            <div style={lbl}>Окончание</div>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ ...inp, fontFamily: PLEX }} />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#8A918D', lineHeight: 1.5, marginBottom: 14 }}>
          «Плановый» и «В работе» система ставит автоматически по фактическим платежам;
          «Завершён» отмечается вручную.
        </div>
        {error && <div style={{ fontSize: 12, color: '#B93227', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отмена</div>
          <div onClick={valid ? submit : undefined} className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </div>
        </div>
      </div>
    </div>
  );
}
