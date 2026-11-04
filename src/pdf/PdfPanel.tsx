/** Pannello anteprima PDF: zoom, fit, ricarica, stato vuoto e avviso PDF non aggiornato. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ipc, errMsg } from '../utils/ipc';
import { loadPdfFromBase64 } from './pdfjs';
import { PdfPages } from './PdfPages';
import { useBuildStore } from '../state/useBuildStore';

type Zoom = { mode: 'fit-width' } | { mode: 'fit-page' } | { mode: 'scale'; value: number };

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;

export function PdfPanel(): JSX.Element {
  const pdf = useBuildStore((s) => s.pdf);
  const pdfStale = useBuildStore((s) => s.pdfStale);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [zoom, setZoom] = useState<Zoom>({ mode: 'fit-width' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reload = useCallback(async () => {
    if (!pdf) {
      setDoc(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const b64 = await ipc.readPdf(pdf.path);
      const next = await loadPdfFromBase64(b64);
      setDoc((old) => {
        void old?.destroy();
        return next;
      });
    } catch (e) {
      setError(errMsg(e));
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [pdf]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const zoomIn = () =>
    setZoom((z) =>
      z.mode === 'scale'
        ? { mode: 'scale', value: Math.min(MAX_SCALE, z.value * 1.25) }
        : { mode: 'scale', value: 1.25 },
    );
  const zoomOut = () =>
    setZoom((z) =>
      z.mode === 'scale'
        ? { mode: 'scale', value: Math.max(MIN_SCALE, z.value / 1.25) }
        : { mode: 'scale', value: 1 },
    );

  const zoomLabel =
    zoom.mode === 'scale'
      ? `${Math.round(zoom.value * 100)}%`
      : zoom.mode === 'fit-width'
        ? 'Largh.'
        : 'Pagina';

  return (
    <section className="pdf-panel" aria-label="Anteprima PDF">
      <header className="pdf-toolbar">
        <span className="pdf-title">PDF</span>
        <div className="pdf-tools">
          <button className="btn-icon" title="Riduci zoom" onClick={zoomOut} disabled={!doc}>
            −
          </button>
          <span className="pdf-zoom">{zoomLabel}</span>
          <button className="btn-icon" title="Aumenta zoom" onClick={zoomIn} disabled={!doc}>
            +
          </button>
          <button
            className="btn-icon"
            title="Adatta alla larghezza"
            onClick={() => setZoom({ mode: 'fit-width' })}
            disabled={!doc}
          >
            ↔
          </button>
          <button
            className="btn-icon"
            title="Adatta alla pagina"
            onClick={() => setZoom({ mode: 'fit-page' })}
            disabled={!doc}
          >
            ⤢
          </button>
          <button className="btn-icon" title="Ricarica PDF" onClick={() => void reload()} disabled={!pdf}>
            ⟳
          </button>
        </div>
      </header>

      {pdfStale && doc && (
        <div className="pdf-warning" role="alert">
          L'ultima build non è riuscita: mostro l'ultimo PDF valido.
        </div>
      )}
      {loading && <div className="pdf-note">Caricamento PDF…</div>}
      {error && <div className="pdf-error" role="alert">{`Impossibile caricare il PDF: ${error}`}</div>}

      <div className="pdf-scroll" ref={containerRef}>
        {!pdf && !loading && (
          <div className="pdf-empty">
            <div className="pdf-empty-title">Nessun PDF</div>
            <p>Lancia una build per generare l'anteprima del documento.</p>
          </div>
        )}
        {doc && (
          <PdfPages doc={doc} zoom={zoom} containerSize={containerSize} />
        )}
      </div>
    </section>
  );
}
