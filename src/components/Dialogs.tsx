import { useEffect, useRef, useState } from "react";

/** Small reusable prompt dialog (single text input + confirm/cancel). */
export function PromptDialog(props: {
  title: string;
  hint?: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [value, setValue] = useState(props.initial ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (): void => {
    const v = value.trim();
    if (v.length > 0) props.onConfirm(v);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <div className="modal" role="dialog" aria-modal={true} aria-label={props.title}>
        <h3>{props.title}</h3>
        {props.hint && <p className="dialog-hint">{props.hint}</p>}
        <div className="form-row">
          <label htmlFor="prompt-input">{props.label}</label>
          <input
            id="prompt-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") props.onCancel();
            }}
          />
        </div>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={submit}>
            {props.confirmLabel ?? "OK"}
          </button>
          <button className="btn" onClick={props.onCancel}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small reusable confirmation dialog. */
export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <div className="modal" role="dialog" aria-modal={true} aria-label={props.title}>
        <h3>{props.title}</h3>
        <p className="dialog-hint">{props.message}</p>
        <div className="dialog-actions">
          <button
            className={props.danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? "Conferma"}
          </button>
          <button className="btn" onClick={props.onCancel}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
