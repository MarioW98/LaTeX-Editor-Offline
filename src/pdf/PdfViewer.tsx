// PDF preview panel (PDF.js).
//
// The PDF bytes are re-read from disk through the raw IPC command on every
// build completion and on manual reload — implicit cache busting. When a
// build fails the last valid PDF stays on screen with a warning banner.

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { useAppStore } from "../state/store";
import * as ipc from "../tauri/ipc";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type Zoom = "fit" | number;

/** Minimal structural type for a pdf.js render task. */
interface PdfRenderTask {
  cancel: () => void;
  promise: Promise<void>;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function PdfViewer(): JSX.Element {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const pdfPath = useAppStore((s) => s.build.lastGoodPdfPath);
  const buildId = useAppStore((s) => s.build.buildId);
  const buildStatus = useAppStore((s) => s.build.status);
  const buildMessage = useAppStore((s) => s.build.message);
  const reloadToken = useAppStore((s) => s.pdfReloadToken);
  const reloadPdf = useAppStore((s) => s.reloadPdf);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [docVersion, setDocVersion] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [containerWidth, setContainerWidth] = useState(800);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- load / reload the document -----------------------------------------
  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (!pdfPath || !projectRoot) {
        if (docRef.current) {
          void docRef.current.destroy();
          docRef.current = null;
          setNumPages(0);
        }
        return;
      }
      setLoading(true);
      try {
        const buf = await ipc.readPdfBytes(projectRoot, pdfPath);
        const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const d = await task.promise;
        if (cancelled) {
          void d.destroy();
          return;
        }
        if (docRef.current && docRef.current !== d) {
          void docRef.current.destroy();
        }
        docRef.current = d;
        setNumPages(d.numPages);
        setPageNum((p) => Math.min(Math.max(1, p), d.numPages));
        setLoadError(null);
        setDocVersion((v) => v + 1);
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pdfPath, buildId, reloadToken, projectRoot]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      renderTaskRef.current?.cancel();
      if (docRef.current) {
        void docRef.current.destroy();
        docRef.current = null;
      }
    };
  }, []);

  // ---- track the container width (for the "fit" zoom) ----------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setContainerWidth((prev) => (Math.abs(prev - w) > 4 ? w : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- render the current page ---------------------------------------------
  useEffect(() => {
    const render = async (): Promise<void> => {
      const canvas = canvasRef.current;
      const doc = docRef.current;
      if (!canvas || !doc || numPages === 0) return;
      try {
        const page = await doc.getPage(Math.min(Math.max(1, pageNum), doc.numPages));
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(200, containerWidth - 28);
        const scale = zoom === "fit" ? available / base.width : zoom;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTaskRef.current?.cancel();
        const task = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        const name = (e as { name?: string }).name ?? "";
        if (!name.includes("RenderingCancelledException")) {
          console.warn("Rendering PDF interrotto:", e);
        }
      }
    };
    void render();
  }, [pageNum, zoom, containerWidth, numPages, docVersion]);

  const zoomPercent = zoom === "fit" ? null : Math.round(zoom * 100);

  const zoomIn = (): void =>
    setZoom((z) => clampZoom((typeof z === "number" ? z : 1) * 1.2));
  const zoomOut = (): void =>
    setZoom((z) => clampZoom((typeof z === "number" ? z : 1) / 1.2));

  const banner =
    buildStatus === "error"
      ? buildMessage ?? "Compilazione non riuscita: mostro l'ultimo PDF valido."
      : loadError
        ? `Impossibile caricare il PDF: ${loadError}`
        : null;

  return (
    <div className="pdf-panel">
      <div className="pdf-toolbar">
        <button
          className="btn btn-ghost btn-small"
          title="Pagina precedente"
          disabled={pageNum <= 1}
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
        >
          ◀
        </button>
        <span className="page-indicator">
          {numPages > 0 ? `${pageNum} / ${numPages}` : "—"}
        </span>
        <button
          className="btn btn-ghost btn-small"
          title="Pagina successiva"
          disabled={numPages === 0 || pageNum >= numPages}
          onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
        >
          ▶
        </button>
        <span className="toolbar-spacer" />
        <button className="btn btn-ghost btn-small" title="Riduci" onClick={zoomOut} disabled={!pdfPath}>
          −
        </button>
        <span className="page-indicator">{zoomPercent ? `${zoomPercent}%` : "Adatta"}</span>
        <button className="btn btn-ghost btn-small" title="Ingrandisci" onClick={zoomIn} disabled={!pdfPath}>
          +
        </button>
        <button
          className="btn btn-ghost btn-small"
          title="Adatta alla larghezza"
          onClick={() => setZoom("fit")}
          disabled={!pdfPath}
        >
          ⤢
        </button>
        <button
          className="btn btn-ghost btn-small"
          title="Ricarica il PDF dal disco"
          onClick={reloadPdf}
          disabled={!pdfPath}
        >
          ⟳
        </button>
      </div>

      {banner && pdfPath && <div className="pdf-banner">{banner}</div>}

      {pdfPath ? (
        <div className="pdf-scroll" ref={scrollRef}>
          <canvas ref={canvasRef} />
          {loading && <div className="pdf-empty">Caricamento PDF…</div>}
        </div>
      ) : (
        <div className="pdf-empty">
          <div>
            Nessun PDF da mostrare.
            <br />
            <span style={{ fontSize: 12 }}>Premi «Compila» per produrre il primo PDF.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PdfViewer;
