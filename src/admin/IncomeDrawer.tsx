import type { CSSProperties } from 'react';
import { ACC, PLEX } from '../theme';

export interface IncomeDrawerProps {
  onClose: () => void;
}

/** Подпись поля формы. */
const lbl: CSSProperties = { fontSize: 12, color: '#6B7370', marginBottom: 4 };
/** Текстовый инпут формы. */
const inp: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none' };
/** Селект формы. */
const sel: CSSProperties = { width: '100%', height: 36, border: '1px solid #DFDCD6', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff' };
/** Заголовок секции формы. */
const sec: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: '#A6ACA8', margin: '0 0 10px' };

export default function IncomeDrawer(props: IncomeDrawerProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div onClick={props.onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.38)', animation: 'finFade .15s ease' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, maxWidth: '94vw', background: '#fff', boxShadow: '-18px 0 44px rgba(0,0,0,.14)', animation: 'finSlide .22s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: '1px solid #EFEEE9' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Новый доход</div>
            <div style={{ fontSize: 11.5, color: '#8A918D', marginTop: 1 }}>№ Д-1049 · черновик</div>
          </div>
          <div style={{ flex: 1 }} />
          <div onClick={props.onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7370' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={sec}>ОСНОВНОЕ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><div style={lbl}>Категория</div><select style={sel}><option>Аванс от заказчика</option><option>Промежуточный платёж</option><option>Окончательный платёж</option><option>Оплата оборудования</option><option>Оплата монтажных работ</option><option>Сервисное обслуживание</option><option>Техническая поддержка</option><option>Продажа оборудования</option><option>Прочие доходы</option></select></div>
            <div><div style={lbl}>Проект</div><select style={sel}><option>Насосная станция Вахдат</option><option>ГЭС Помир-1</option><option>Сервис Душанбе</option><option>Без проекта</option></select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><div style={lbl}>Заказчик</div><input placeholder="Например, ОАО «Обу корез»" style={inp} /></div>
            <div><div style={lbl}>Договор / счёт №</div><input placeholder="Д-24/118 · счёт 214" style={inp} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><div style={lbl}>Описание</div><input placeholder="За что поступают деньги" style={inp} /></div>
          <div style={sec}>СУММЫ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><div style={lbl}>Плановая сумма</div><input placeholder="0" style={{ ...inp, textAlign: 'right', fontFamily: PLEX }} /></div>
            <div><div style={lbl}>Валюта</div><select style={sel}><option>TJS — сомони</option><option>USD</option><option>EUR</option><option>RUB</option><option>CNY</option></select></div>
            <div><div style={lbl}>Курс к сомони</div><input placeholder="1,00" style={{ ...inp, textAlign: 'right', fontFamily: PLEX }} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div><div style={lbl}>Фактическая сумма</div><input placeholder="Заполняется при оплате" style={{ ...inp, background: '#FAF9F6', textAlign: 'right', fontFamily: PLEX }} /></div>
            <div><div style={lbl}>Сумма в сомони</div><input placeholder="считается автоматически" disabled style={{ ...inp, border: '1px solid #EFEDE8', background: '#FAF9F6', textAlign: 'right', color: '#8A918D', fontFamily: PLEX }} /></div>
          </div>
          <div style={sec}>ОПЛАТА И ОТВЕТСТВЕННОСТЬ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><div style={lbl}>Плановая дата</div><input placeholder="28.10.2026" style={inp} /></div>
            <div><div style={lbl}>Способ оплаты</div><select style={sel}><option>Банковский перевод</option><option>Наличные — касса</option></select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div><div style={lbl}>Счёт зачисления</div><select style={sel}><option>Амонатбанк · TJS</option><option>Ориёнбанк · TJS</option><option>Касса</option></select></div>
            <div><div style={lbl}>Ответственный</div><select style={sel}><option>М. Саидова — бухгалтер</option><option>Ф. Назаров — фин. сотрудник</option></select></div>
          </div>
          <div style={sec}>ДОКУМЕНТ</div>
          <div className="hv-paper" style={{ border: '1.5px dashed #D8D5CE', borderRadius: 10, padding: 18, textAlign: 'center', color: '#8A918D', fontSize: 12.5, marginBottom: 12, cursor: 'pointer' }}>Перетащите файл или нажмите<br /><span style={{ fontSize: 11.5, color: '#A6ACA8' }}>счёт · договор · накладная · чек · PDF · фото</span></div>
          <div><div style={lbl}>Комментарий</div><textarea placeholder="Необязательно" style={{ width: '100%', height: 64, border: '1px solid #DFDCD6', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff', outline: 'none', resize: 'none' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #EFEEE9' }}>
          <div onClick={props.onClose} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#3E4643', cursor: 'pointer' }}>Отмена</div>
          <div onClick={props.onClose} className="hv-dim" style={{ background: ACC, color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Сохранить</div>
        </div>
      </div>
    </div>
  );
}
