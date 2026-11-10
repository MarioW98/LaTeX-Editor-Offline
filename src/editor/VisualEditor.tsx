import { forwardRef, useEffect, useImperativeHandle } from "react";
import type { Ref } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useStore } from "../state/store.ts";
import { visualExtensions } from "./visualExtensions.ts";
import { EditorToolbar } from "./EditorToolbar.tsx";
import type { DocJson } from "../visual/schema.ts";
import styles from "./visual.module.css";
import "./katex.css";
/**
 * M1 — Handle imperativo: EditorPane legge il documento live dell'editor
 * quando serve (toggle verso Sorgente, cambio tab), senza esporre l'istanza.
 */
export interface VisualEditorHandle {
  getDocJson(): DocJson | null;
}

/**
 * M1 — Editor visuale TipTap.
 *
 * Il documento iniziale arriva dallo store (visualDoc, prodotto da
 * latexToDoc): il sorgente resta l'unica verità, qui dentro non si tiene
 * nessuna copia sincronizzata. Le modifiche tornano al sorgente SOLO quando
 * si rientra in Sorgente (toggleToSource serializza e confronta byte per
 * byte). I chip sono nodi atomici read-only resi dal renderHTML statico.
 */
export const VisualEditor = forwardRef<VisualEditorHandle>(function VisualEditor(_props: {}, ref: Ref<VisualEditorHandle>) {
  const visualDoc = useStore((s) => s.visualDoc);
  const fontSize = useStore((s) => s.settings.fontSize);

  const editor = useEditor({
    extensions: visualExtensions(),
    // Contenuto sempre presente al mount: la modalità visuale si attiva
    // solo dopo un parse riuscito.
    content: visualDoc ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        // Il corpo del documento LaTeX non è un titolo: mai title-case.
        spellcheck: "false",
        style: `font-size: ${fontSize}px`,
      },
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      getDocJson: () => (editor ? (editor.getJSON() as DocJson) : null),
    }),
    [editor],
  );

  // La dimensione del font scelta nelle impostazioni resta viva anche in
  // modalità visuale: si riapplica in place, come fa CodeMirror col suo
  // compartment, senza ricreare l'editor (la cronologia undo sopravvive).
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          spellcheck: "false",
          style: `font-size: ${fontSize}px`,
        },
      },
    });
  }, [editor, fontSize]);

  return (
    <div className={styles.visualHost}>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} className={styles.visualContent} />
    </div>
  );
});
