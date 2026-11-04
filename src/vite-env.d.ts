/// <reference types="vite/client" />

// Worker PDF.js incorporato inline dal plugin Vite.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
