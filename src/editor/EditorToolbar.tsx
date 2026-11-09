import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/react";
import { TEMPLATE_BLOCCO_GREZZO } from "./visualExtensions.ts";
import styles from "./visual.module.css";

/**
 * M1 — Toolbar di formattazione, visibile SOLO in modalità visuale.
 *
 * In Sorgente non c'è toolbar: il sorgente resta pulito. I bottoni si
 * disabilitano quando il cursore sta dentro un chip grezzo (o in un blocco
 * verbatim): lì la formattazione non ha effetto e il LaTeX non si tocca.
 */
export function EditorToolbar({ editor }: { editor: Editor | null }) {
  // Rerender su ogni transazione (selezione compresa) per riflettere lo
  // stato attivo dei bottoni e la disabilitazione dentro i chip.
  const [, forzaRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", forzaRender);
    return () => {
      editor.off("transaction", forzaRender);
    };
  }, [editor]);

  if (!editor) {
    return <div className={styles.toolbar} aria-hidden="true" />;
  }

  // Cursore dentro un chip o dentro il verbatim: niente formattazione.
  const dentroChip =
    editor.isActive("rawBlock") ||
    editor.isActive("rawInline") ||
    editor.isActive("preamble") ||
    editor.isActive("postamble") ||
    editor.isActive("verbatim");

  const esegui = (azione: () => void) => () => {
    if (dentroChip) return;
    azione();
  };

  const bottone = (
    titolo: string,
    etichetta: string,
    attivo: boolean,
    azione: () => void,
    titoloDisabilitato?: string,
  ) => (
    <button
      type="button"
      title={dentroChip ? (titoloDisabilitato ?? "Non disponibile dentro un chip LaTeX grezzo") : titolo}
      disabled={dentroChip}
      aria-pressed={attivo}
      className={attivo ? styles.toolbarAttivo : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={esegui(azione)}
    >
      {etichetta}
    </button>
  );

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formattazione della vista visuale">
      {bottone("Grassetto (\\textbf)", "G", editor.isActive("bold"), () =>
        editor.chain().focus().toggleBold().run(),
      )}
      {bottone("Corsivo (\\emph)", "C", editor.isActive("italic"), () =>
        editor.chain().focus().toggleItalic().run(),
      )}
      {bottone("Sottolineato (\\underline)", "S", editor.isActive("underline"), () =>
        editor.chain().focus().toggleUnderline().run(),
      )}
      {bottone("Monospace (\\texttt)", "mono", editor.isActive("code"), () =>
        editor.chain().focus().toggleCode().run(),
      )}
      <span className={styles.toolbarSeparatore} />
      {bottone("Sezione (\\section)", "Sez", editor.isActive("heading", { level: 1 }), () =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
      )}
      {bottone("Sottosezione (\\subsection)", "Sottosez", editor.isActive("heading", { level: 2 }), () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      {bottone("Sottosottosezione (\\subsubsection)", "Sottosottosez", editor.isActive("heading", { level: 3 }), () =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
      )}
      <span className={styles.toolbarSeparatore} />
      {bottone("Elenco puntato (itemize)", "• Elenco", editor.isActive("bulletList"), () =>
        editor.chain().focus().toggleBulletList().run(),
      )}
      {bottone("Elenco numerato (enumerate)", "1. Elenco", editor.isActive("orderedList"), () =>
        editor.chain().focus().toggleOrderedList().run(),
      )}
      {bottone("Citazione (quote)", "❝ Citazione", editor.isActive("blockquote"), () =>
        editor.chain().focus().toggleBlockquote().run(),
      )}
      {bottone("Blocco verbatim", "</> Verbatim", false, () =>
        editor
          .chain()
          .focus()
          .insertContent({ type: "verbatim", content: [{ type: "text", text: "\n" }] })
          .run(),
      )}
      {bottone(
        "Blocco LaTeX grezzo: leggilo e modificalo in Sorgente",
        "{ } LaTeX",
        false,
        () =>
          editor
            .chain()
            .focus()
            .insertContent({ type: "rawBlock", attrs: { latex: TEMPLATE_BLOCCO_GREZZO } })
            .run(),
        "Non disponibile dentro un chip LaTeX grezzo",
      )}
    </div>
  );
}
