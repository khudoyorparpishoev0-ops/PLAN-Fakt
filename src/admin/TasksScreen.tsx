import { useEffect, useState, type CSSProperties } from 'react';
import { ACC, PLEX, num } from '../theme';
import { fmtD } from '../lib/format';
import { badge, type BadgeData } from '../lib/badges';
import {
  api, ApiError,
  type ApiAssignee, type ApiProject, type ApiTask, type TaskPayload, type TaskStatus,
} from '../lib/api';
import { AccentBtn, Badge, Th } from '../components/ui';
import { useIsMobile } from '../lib/responsive';
import { useEscapeClose } from '../lib/escape';
import { EmptyState } from '../components/states';

export interface TasksScreenProps {
  projects: ApiProject[];
  /** Пользователи для назначения (только у админа список полный). */
  users: ApiAssignee[];
  /** Роль текущего пользователя: исполнитель меняет только статус. */
  role: 'admin' | 'director' | 'accountant';
  onError: (msg: string) => void;
}

const statusB = (s: TaskStatus): BadgeData =>
  s === 'done' ? badge('Выполнена', 'green')
  : s === 'in_progress' ? badge('В работе', 'yellow')
  : s === 'canceled' ? badge('Отменена', 'gray')
  : badge('Новая', 'blue');

const PRIORITY_LABEL: Record<string, string> = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
const priorityColor = (p: string) => (p === 'high' ? 'var(--fin-minus)' : p === 'low' ? 'var(--fin-text-4)' : 'var(--fin-text-2)');

const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid var(--fin-border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--fin-surface)', outline: 'none' };
const lbl: CSSProperties = { fontSize: 12, color: 'var(--fin-text-3)', marginBottom: 4 };

/** Форма задачи (создание и правка). */
function TaskModal({ initial, projects, users, onClose, onSubmit }: {
  initial?: ApiTask;
  projects: ApiProject[];
  users: ApiAssignee[];
  onClose: () => void;
  onSubmit: (payload: TaskPayload) => Promise<void>;
}) {
  useEscapeClose(onClose);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [projectId, setProjectId] = useState(String(initial?.projectId ?? ''));
  const [assigneeId, setAssigneeId] = useState(String(initial?.assigneeId ?? ''));
  const [priority, setPriority] = useState(initial?.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 3 && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        ...(projectId ? { projectId: Number(projectId) } : {}),
        ...(assigneeId ? { assigneeId: Number(assigneeId) } : {}),
        priority: priority as 'low' | 'normal' | 'high',
        ...(dueDate ? { dueDate } : {}),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить задачу');
      setBusy(false);
    }
  };

  return (
    <div data-task-modal style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.42)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '94vw', background: 'var(--fin-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.24)', padding: '22px 24px', animation: 'finFade .18s ease' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{initial ? 'Изменить задачу' : 'Новая задача'}</div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Что нужно сделать</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Например, собрать закрывающие документы" autoFocus style={inp} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Описание</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Необязательно"
            style={{ ...inp, height: 64, padding: '8px 10px', resize: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={lbl}>Исполнитель</div>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={{ ...inp, padding: '0 8px' }}>
              <option value="">Не назначен</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Проект</div>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inp, padding: '0 8px' }}>
              <option value="">Без проекта</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={lbl}>Приоритет</div>
            <select value={priority} onChange={e => setPriority(e.target.value as 'low' | 'normal' | 'high')} style={{ ...inp, padding: '0 8px' }}>
              <option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option>
            </select>
          </div>
          <div>
            <div style={lbl}>Срок</div>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inp, fontFamily: PLEX }} />
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--fin-minus)', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div onClick={onClose} className="hv-soft" style={{ border: '1px solid var(--fin-border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Отмена</div>
          <div onClick={valid ? submit : undefined} className={valid ? 'hv-dim' : undefined}
            style={{ background: ACC, color: 'var(--fin-surface)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'default', ...(valid ? {} : { opacity: 0.45 }) }}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Модуль «Задачи» (этап 2): список с фильтрами, назначение исполнителя,
 *  смена статуса. Бухгалтер видит только свои задачи и меняет их статус. */
export default function TasksScreen({ projects, users, role, onError }: TasksScreenProps) {
  const isMobile = useIsMobile();
  const canManage = role === 'admin' || role === 'director';
  const [rows, setRows] = useState<ApiTask[]>([]);
  const [fStatus, setFStatus] = useState('');
  const [fProject, setFProject] = useState('');
  const [modal, setModal] = useState<{ task?: ApiTask } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.tasks({ status: fStatus || undefined, project: fProject ? Number(fProject) : undefined })
      .then(setRows)
      .catch((e: unknown) => onError(e instanceof ApiError ? e.message : 'Не удалось загрузить задачи'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [fStatus, fProject]);

  const setStatus = async (t: ApiTask, status: TaskStatus) => {
    try {
      await api.updateTask(t.id, { status });
      load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось изменить статус');
    }
  };
  const remove = async (t: ApiTask) => {
    if (!window.confirm(`Удалить задачу «${t.title}»?`)) return;
    try {
      await api.removeTask(t.id);
      load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Не удалось удалить задачу');
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const counts = {
    open: rows.filter(r => r.status === 'open').length,
    in_progress: rows.filter(r => r.status === 'in_progress').length,
    done: rows.filter(r => r.status === 'done').length,
    overdue: rows.filter(r => r.dueDate && r.dueDate < today && r.status !== 'done' && r.status !== 'canceled').length,
  };

  return (
    <div data-screen-label="Задачи">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...inp, width: 'auto', height: 34, padding: '0 8px' }}>
          <option value="">Все статусы</option>
          <option value="open">Новые</option>
          <option value="in_progress">В работе</option>
          <option value="done">Выполненные</option>
          <option value="canceled">Отменённые</option>
        </select>
        <select value={fProject} onChange={e => setFProject(e.target.value)} style={{ ...inp, width: 'auto', height: 34, padding: '0 8px' }}>
          <option value="">Все проекты</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {canManage && (
          <AccentBtn style={{ padding: '8px 15px' }} onClick={() => setModal({})}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Задача
          </AccentBtn>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {([
          ['НОВЫЕ', counts.open, ACC],
          ['В РАБОТЕ', counts.in_progress, 'var(--fin-warn)'],
          ['ВЫПОЛНЕНО', counts.done, 'var(--fin-plus)'],
          ['ПРОСРОЧЕНО', counts.overdue, 'var(--fin-minus)'],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--fin-text-4)', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color, ...num }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th style={{ padding: '8px 12px 8px 16px' }}>Задача</Th>
              <Th>Исполнитель</Th>
              <Th>Проект</Th>
              <Th right>Срок</Th>
              <Th>Приоритет</Th>
              <Th>Статус</Th>
              <Th style={{ padding: '8px 16px 8px 12px' }}>Действия</Th>
            </tr></thead>
            <tbody>
              {rows.map(t => {
                const overdue = t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'canceled';
                return (
                  <tr key={t.id} className="hv-row">
                    <td style={{ padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--fin-divider)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                      {t.description && <div style={{ fontSize: 11.5, color: 'var(--fin-text-4)', marginTop: 1 }}>{t.description}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5 }}>{t.assignee ?? '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: 'var(--fin-text-2)' }}>{t.project ?? '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: PLEX, color: overdue ? 'var(--fin-minus)' : 'var(--fin-text-3)', fontWeight: overdue ? 600 : 400 }}>
                      {fmtD(t.dueDate)}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--fin-divider)', fontSize: 12.5, color: priorityColor(t.priority), fontWeight: t.priority === 'high' ? 600 : 400 }}>
                      {PRIORITY_LABEL[t.priority]}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--fin-divider)' }}><Badge b={statusB(t.status)} /></td>
                    <td style={{ padding: '10px 16px 10px 12px', borderBottom: '1px solid var(--fin-divider)' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.status !== 'done' && (
                          <span onClick={() => void setStatus(t, t.status === 'open' ? 'in_progress' : 'done')} className="hv-soft"
                            style={{ border: '1px solid var(--fin-border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: ACC, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {t.status === 'open' ? 'В работу' : 'Выполнена'}
                          </span>
                        )}
                        {canManage && (
                          <>
                            <span onClick={() => setModal({ task: t })} className="hv-soft"
                              style={{ border: '1px solid var(--fin-border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--fin-text-2)', cursor: 'pointer' }}>Изменить</span>
                            <span onClick={() => void remove(t)} className="hv-red"
                              style={{ border: '1px solid var(--fin-minus-soft)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--fin-minus)', cursor: 'pointer' }}>Удалить</span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 0 }}>
                  {loading
                    ? <div style={{ padding: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--fin-text-5)' }}>Загрузка…</div>
                    : <EmptyState tone="plus" title="Задач нет"
                        text="Ничего не назначено и не просрочено. Новые появятся здесь, как только их поставят."
                        icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>} />}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fin-text-4)', marginTop: 10, lineHeight: 1.5 }}>
        Статусы: Новая → В работе → Выполнена. Исполнитель может двигать статус своей задачи;
        создание, назначение и удаление — у руководителя и директора.
      </div>

      {modal && (
        <TaskModal
          initial={modal.task}
          projects={projects}
          users={users}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            if (modal.task) await api.updateTask(modal.task.id, payload);
            else await api.createTask(payload);
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
