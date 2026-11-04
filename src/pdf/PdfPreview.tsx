import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";
import { useStore } from "../state/store";
import styles from "../styles/panels.module.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 60;

function Page({
  doc,
  pageNumber,
  scale,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = ref.current;
      if (!canvas) return;
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, scale]);

  return <canvas ref={ref} className={styles.pdfPage} />;
}

export function PdfPreview() {
  const rootPath = useStore((s) => s.rootPath);
  const mainFile = useStore((s) => s.settings.mainFile);
  const pdfVersion = useStore((s) => s.pdfVersion);
  const buildRunning = useStore((s) => s.buildRunning);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let localDoc: PDFDocumentProxy | null = null;
    (async () => {
      if (!rootPath || buildRunning) return;
      setError(null);
      try {
        const buf = await api.readPdfBytes(rootPath, mainFile);
        if (cancelled) return;
        const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        localDoc = await task.promise;
        if (cancelled) {
          localDoc.destroy();
          return;
        }
        setDoc((prev) => {
          prev?.destroy();
          return localDoc;
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            String(e).includes("PDF non trovato")
              ? "Nessun PDF: compila il progetto per generarlo."
              : `Impossibile caricare il PDF: ${String(e)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      localDoc?.destroy();
    };
  }, [rootPath, mainFile, pdfVersion, reloadNonce, buildRunning]);

  const fitWidth = () => {
    const host = hostRef.current;
    if (!host || !doc) return;
    doc
      .getPage(1)
      .then((p) => {
        const vp = p.getViewport({ scale: 1 });
        const target = Math.max(0.3, (host.clientWidth - 32) / vp.width);
        setScale(target);
      })
      .catch(() => undefined);
  };

  const numPages = doc ? Math.min(doc.numPages, MAX_PAGES) : 0;

  return (
    <aside className={styles.pdfPane} ref={hostRef}>
      <div className={styles.pdfToolbar}>
        <strong>Anteprima PDF</strong>
        <span className={styles.pdfSpacer} />
        <button title="Riduci" onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}>
          −
        </button>
        <span className={styles.pdfZoom}>{Math.round(scale * 100)}%</span>
        <button title="Ingrandisci" onClick={() => setScale((s) => Math.min(4, s + 0.1))}>
          +
        </button>
        <button title="Adatta alla larghezza" onClick={fitWidth}>
          Adatta
        </button>
        <button title="Ricarica" onClick={() => setReloadNonce((n) => n + 1)}>
          Ricarica
        </button>
      </div>
      <div className={styles.pdfScroll}>
        {error && <p className={styles.pdfNotice}>{error}</p>}
        {doc && (
          <p className={styles.pdfMeta}>
            {doc.numPages} pagine
            {doc.numPages > MAX_PAGES ? ` (prime ${MAX_PAGES} mostrate)` : ""}
          </p>
        )}
        {doc &&
          Array.from({ length: numPages }, (_, i) => (
            <Page
              key={`${pdfVersion}-${reloadNonce}-${i + 1}-${scale}`}
              doc={doc}
              pageNumber={i + 1}
              scale={scale}
            />
          ))}
      </div>
    </aside>
  );
}
