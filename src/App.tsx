import { useEffect, useState } from 'react';
import AdminApp from './admin/AdminApp';
import CabinetApp from './cabinet/CabinetApp';

type Route = 'admin' | 'cabinet';
const fromHash = (): Route => (location.hash === '#/cabinet' ? 'cabinet' : 'admin');

/** Точка входа: две части системы — админ-панель руководителя и кабинет бухгалтера.
 *  Переключение — hash-маршруты #/admin и #/cabinet + ссылка в шапке каждой части. */
export default function App() {
  const [route, setRoute] = useState<Route>(fromHash());
  useEffect(() => {
    const f = () => setRoute(fromHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const go = (r: Route) => { location.hash = r === 'cabinet' ? '#/cabinet' : '#/admin'; };

  return route === 'admin'
    ? <AdminApp onSwitchRole={() => go('cabinet')} />
    : <CabinetApp onSwitchRole={() => go('admin')} />;
}
