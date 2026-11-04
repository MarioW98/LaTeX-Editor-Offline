/** Rendering pagine PDF (lazy: solo quando entrano nel viewport). */
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

type Zoom = { mode: 'fit-width' } | { mode: 'fit-page' } | { mode: 'scale'; value: number };

interface PdfPagesProps {
  doc: PDFDocumentProxy;
  zoom: Zoom;
  containerSize: { w: number; h: number };
}

/** Dimensioni della prima pagina (proxy per dimensioni del documento). */
function useBaseSize(doc: PDFDocumentProxy): { w: number; h: number } | null {
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBase(null);
    void doc
      .getPage(1)
      .then((page: PDFPageProxy) => {
        const vp = page.getViewport({ scale: 1 });
        if (!cancelled) setBase({ w: vp.width, h: vp.height });
      })
      .catch(() => setBase(null));
    return () => {
      cancelled = true;
    };
  }, [doc]);
  return base;
}

export function PdfPages({ doc, zoom, containerSize }: PdfPagesProps): JSX.Element | null {
  const base = useBaseSize(doc);
  if (!base) return null;

  const margin = 24;
  let scale: number;
  if (zoom.mode === 'scale') {
    scale = zoom.value;
  } else if (zoom.mode === 'fit-width' && containerSize.w > 0) {
    scale = Math.max(MIN_SCALE, (containerSize.w - margin) / base.w);
  } else if (zoom.mode === 'fit-page' && containerSize.w > 0 && containerSize.h > 0) {
    scale = Math.max(
      MIN_SCALE,
      Math.min((containerSize.w - margin) / base.w, (containerSize.h - margin) / base.h),
    );
  } else {
    scale = 1;
  }

  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return (
    <div className="pdf-pages">
      {pages.map((n) => (
        <LazyPage key={n} doc={doc} pageNumber={n} scale={scale} base={base} />
      ))}
    </div>
  );
}

const MIN_SCALE = 0.3;

interface LazyPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  base: { w: number; h: number };
}

function LazyPage({ doc, pageNumber, scale, base }: LazyPageProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { root: null, rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const key = `${pageNumber}@${scale.toFixed(2)}`;
    if (renderedKey === key) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (!cancelled) setRenderedKey(key);
      } catch {
        /* pagina non più visibile / render annullato */
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [visible, scale, pageNumber, doc, renderedKey]);

  const widthPx = Math.floor(base.w * scale);
  const heightPx = Math.floor(base.h * scale);
  const setWrapRef = (el: HTMLDivElement | null): void => {
    wrapRef.current = el;
  };
  const setCanvasRef = (el: HTMLCanvasElement | null): void => {
    canvasRef.current = el;
  };

  return (
    <div
      className="pdf-page"
      ref={setWrapRef}
      style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
      data-page={pageNumber}
    >
      <canvas ref={setCanvasRef} />
    </div>
  );
}
