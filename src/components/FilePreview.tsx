import { useEffect, useState } from 'react';
import { ACC } from '../theme';
import { api, ApiError } from '../lib/api';
import { useEscapeClose } from '../lib/escape';

export interface FilePreviewProps {
  id: number;
  fileName: string;
  mime?: string | null;
  onClose: () => void;
  onError?: (msg: string) => void;
}

/** Превью вложения прямо в интерфейсе (ТЗ, п. 10): картинка — изображением,
 *  PDF — во встроенном просмотрщике; остальное предлагается скачать. */
export default function FilePreview({ id, fileName, mime, onClose, onError }: FilePreviewProps) {
  useEscapeClose(onClose);
  const [url, setUrl] = useState<string | null>(null);
  const [type, setType] = useState(mime ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    api.attachmentUrl(id)
      .then(r => {
        if (!alive) { URL.revokeObjectURL(r.url); return; }
        created = r.url;
        setUrl(r.url);
        if (r.mime) setType(r.mime);
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : 'Не удалось открыть файл';
        setError(msg);
        onError?.(msg);
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isImage = type.startsWith('image/');
  const isPdf = type === 'application/pdf';

  return (
    <div data-file-preview style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(21,24,23,.62)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 900, maxWidth: '94vw', height: '86vh', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid #EFEEE9' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
            <div style={{ fontSize: 11.5, color: '#8A918D' }}>{type || 'файл'}</div>
          </div>
          {url && (
            <a href={url} download={fileName} className="hv-soft" style={{ border: '1px solid #E0DED8', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: ACC, textDecoration: 'none' }}>Скачать</a>
          )}
          <div onClick={onClose} className="hv-cream" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A918D' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#F1F0EB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isImage ? 16 : 0 }}>
          {error && <div style={{ fontSize: 13, color: '#B93227', padding: 20, textAlign: 'center' }}>{error}</div>}
          {!error && !url && <div style={{ fontSize: 12.5, color: '#8A918D' }}>Загрузка…</div>}
          {url && isImage && <img src={url} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, background: '#fff' }} />}
          {url && isPdf && <iframe src={url} title={fileName} style={{ width: '100%', height: '100%', border: 'none' }} />}
          {url && !isImage && !isPdf && (
            <div style={{ fontSize: 12.5, color: '#5A625E', textAlign: 'center', padding: 20, lineHeight: 1.5 }}>
              Просмотр для этого типа файла не поддерживается.<br />Скачайте файл кнопкой выше.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
