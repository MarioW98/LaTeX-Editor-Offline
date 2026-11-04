import type { JSX } from 'react';

/** Stato vuoto dell'area editor quando nessun file è aperto. */
export function EmptyEditor(): JSX.Element {
  return (
    <div className="empty-editor">
      <div className="empty-title">Nessun file aperto</div>
      <ul className="empty-list">
        <li>Fai clic su un file nell'albero per aprirlo.</li>
        <li>
          <b>Ctrl/Cmd+F</b> ricerca e sostituzione nel file corrente
        </li>
        <li>
          <b>Ctrl/Cmd+S</b> salva · <b>Ctrl/Cmd+B</b> compila
        </li>
        <li>
          <b>Ctrl/Cmd+clic</b> su <code>\ref</code>/<code>\cite</code> salta alla definizione
        </li>
      </ul>
    </div>
  );
}
