/** Dialog: il file aperto è stato modificato su disco. */
import { Modal } from '../../components/Modal';
import { useFileChangeStore } from '../../state/useFileChangeStore';

export function FileChangeDialog(): JSX.Element | null {
  const pending = useFileChangeStore((s) => s.pending);
  const resolve = useFileChangeStore((s) => s.resolve);
  if (!pending) return null;

  return (
    <Modal
      title="File modificato esternamente"
      onClose={() => void resolve(false)}
    >
      <p>
        <b>{pending.tab.rel}</b> è stato modificato fuori dall'editor
        {pending.tab.dirty ? ' e ha anche modifiche non salvate in locale.' : '.'}
      </p>
      {pending.tab.dirty && (
        <p className="fc-warn">Ricaricare scarterà le modifiche locali non salvate.</p>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={() => void resolve(false)}>
          Mantieni la mia versione
        </button>
        <button className="btn btn-build" onClick={() => void resolve(true)}>
          Ricarica da disco
        </button>
      </div>
    </Modal>
  );
}
