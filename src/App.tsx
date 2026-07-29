import { useEffect, useState } from 'react';
import AdminApp from './admin/AdminApp';
import CabinetApp from './cabinet/CabinetApp';

type Route = 'admin' | 'cabinet';
const fromHash = (): Route => (location.hash === '#/cabinet' ? 'cabinet' : 'admin');

/** Точка входа: две части системы — админ-панель руководителя и кабинет бухгалтера.
 *  Переключение ролей — hash-маршруты #/admin и #/cabinet + демо-переключатель. */
export default function App() {
  const [route, setRoute] = useState<Route>(fromHash());
  useEffect(() => {
    const f = () => setRoute(fromHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const go = (r: Route) => { location.hash = r === 'cabinet' ? '#/cabinet' : '#/admin'; };

  return (
    <>
      {route === 'admin' ? <AdminApp /> : <CabinetApp />}
      <div style={{ position: 'fixed', right: 16, bottom: 14, zIndex: 95, display: 'inline-flex', background: 'rgba(27,31,30,.88)', backdropFilter: 'blur(4px)', padding: 3, borderRadius: 99, gap: 2, boxShadow: '0 6px 20px rgba(0,0,0,.22)' }}>
        {(['admin', 'cabinet'] as Route[]).map(r => (
          <div
            key={r}
            onClick={() => go(r)}
            style={{
              padding: '5px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              background: route === r ? '#fff' : 'transparent',
              color: route === r ? '#1B1F1E' : 'rgba(255,255,255,.75)',
            }}
          >
            {r === 'admin' ? 'Руководитель' : 'Бухгалтер'}
          </div>
        ))}
      </div>
    </>
  );
}
