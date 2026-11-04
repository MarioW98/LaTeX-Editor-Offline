/** Inizializzazione PDF.js: worker bundle inline → funziona offline. */
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

/** Carica un PDF dai byte (base64 ricevuto dal comando Rust `read_pdf`). */
export async function loadPdfFromBase64(b64: string): Promise<PDFDocumentProxy> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return pdfjsLib.getDocument({ data: bytes }).promise;
}

export type { PDFDocumentProxy, PDFPageProxy };
