# LaTeX Editor Offline

Editor LaTeX **offline** e multipiattaforma, costruito con **Tauri 2 + Rust + React + TypeScript + CodeMirror 6 + PDF.js**.

- I progetti sono **normali cartelle di file** (nessun lock-in, nessun database).
- La compilazione usa la **distribuzione TeX installata localmente** (TeX Live, MiKTeX, TinyTeX…), con `latexmk` se disponibile e pipeline di fallback altrimenti.
- **Nessuna connessione obbligatoria**: niente account, cloud, telemetria, analytics o tracking.
- La collaborazione è **fuori perimetro** in questa versione: l'architettura ha però stub e interfacce pronti (`src/collab/`) per aggiungerla senza riscritture pesanti.

> Progetto originale: nessun codice, UI, asset, testo o marchio derivato da altri editor.

Anteprime dell'interfaccia (tema scuro/chiaro) in [`docs/screenshots/`](./docs/screenshots/).

## Requisiti

- **Node.js ≥ 18** e npm.
- **Rust ≥ 1.77** ([rustup](https://rustup.rs)).
- **Tauri CLI** (già in `devDependencies`).
- Una **distribuzione LaTeX** per compilare (facoltativa per modificare i file):
  - TeX Live — <https://tug.org/texlive>
  - MiKTeX — <https://miktex.org>
  - TinyTeX — <https://yihui.org/tinytex>
- Linux: librerie di sistema di Tauri (Debian/Ubuntu):

  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

- macOS: Xcode Command Line Tools (`xcode-select --install`).
- Windows: WebView2 (incluso in Windows 10/11 recenti) e MSVC Build Tools.

## Avvio in sviluppo

```bash
npm install
npm run tauri dev
```

La prima compilazione Rust richiede qualche minuto; le successive sono incrementali.

## Build di produzione

```bash
npm run tauri build
```

Gli installer/bundle vengono creati in `src-tauri/target/release/bundle/`.
Se servono icone rigenerate: `npm run tauri icon src-tauri/icons/icon.png`.

## Cosa c'è in questa versione

| Area | Funzioni |
| --- | --- |
| Progetto | Apri cartella, nuovo progetto da 5 template (article/report/book/beamer/thesis), metadata `.latex-editor/project.json`, recenti |
| File | Albero laterale con icone per tipo, crea/rinomina/elimina/ricarica, "imposta come main" |
| Editor | CodeMirror 6: multi-tab, dirty-state, undo/redo, ricerca/sostituzione, selezioni multiple, evidenziazione LaTeX/BibTeX/Markdown, auto-chiusura `{[(` e `\begin{}` , snippet, completamento (comandi, ambienti, `\label`/`\ref`, `\cite`, file del progetto), Ctrl/Cmd+clic su `\ref`/`\cite` per saltare alla definizione |
| Salvataggio | Ctrl/Cmd+S, autosave opzionale con debounce, rilevamento modifiche esterne con dialog "ricarica/mantieni" |
| Build | Rilevamento strumenti (latexmk, pdflatex, xelatex, lualatex, bibtex, biber), scelta motore, output in `.latex-editor/build`, annullabile, output in streaming, parsing errori/warning con click → riga |
| PDF | Anteprima PDF.js con zoom/fit width/fit page/ricarica, aggiornamento dopo build riuscita, "ultimo PDF valido" se la build fallisce |
| Impostazioni | Globali (profilo app) + per progetto (override), tema chiaro/scuro, font editor, word wrap, autosave, cartella bin LaTeX, shell-escape con avvisi |
| Sicurezza | FS confinato alla cartella progetto (sandbox lato Rust), build solo dentro il progetto, shell-escape disattivato di default, nessun comando arbitrario, nessuna rete |

## Struttura del repository

```
latex-editor-offline/
├── package.json / tsconfig.json / vite.config.ts / index.html
├── src/                     # frontend React + TypeScript
│   ├── main.tsx / App.tsx
│   ├── components/          # Toolbar, StatusBar, Modal, Toasts, Splitter
│   ├── features/            # Welcome, NewProject, FileChange (dialog)
│   ├── editor/              # CodeMirror: docStates, estensioni, linguaggio,
│   │   │                    #   completamento, snippet, auto-chiusura, salti \ref
│   │   └── latex/
│   ├── filetree/            # albero file + icone
│   ├── pdf/                 # pannello PDF.js (pagine lazy)
│   ├── build/               # pannello output/problemi + eventi build
│   ├── settings/            # pagina impostazioni
│   ├── state/               # store Zustand (progetto, editor, build, ui, ...)
│   ├── collab/              # STUB: interfacce per la futura collaborazione
│   ├── utils/               # IPC tipizzata + path helper
│   └── styles/              # tema chiaro/scuro + layout
├── src-tauri/               # backend Rust
│   ├── Cargo.toml / tauri.conf.json / capabilities/
│   └── src/
│       ├── main.rs / state.rs / error.rs / templates.rs
│       ├── commands/        # comandi Tauri (fs sandboxato, build, settings)
│       ├── fs/              # sandbox percorsi, albero, scansione label
│       ├── latex/           # rilevamento strumenti, argomenti motori
│       └── build/           # runner pipeline + parser log
├── templates/               # 5 template originali (incorporati nel binario)
└── examples/demo-article/   # progetto di esempio pronto da aprire
```

## Modello dati

- **Progetto** = cartella qualsiasi con file LaTeX.
- **Metadati progetto** = `.latex-editor/project.json` (nome, main file, motore, output dir, override, timestamp). Se manca viene creato con default sensati (main = `main.tex` o primo `.tex` con `\documentclass`).
- **Impostazioni globali** = `settings.json` nella cartella dati dell'app (`app_config_dir`).
- **Build** = tutto dentro la directory di output configurata (default `.latex-editor/build`, ignorata da `.gitignore`): la cartella progetto resta pulita.

## Pipeline di compilazione

1. Se `latexmk` è disponibile (e non disattivato): una sola chiamata
   `latexmk -interaction=nonstopmode -file-line-error [-pdf|-pdfxe|-pdflua] -outdir=<out> <main>`.
2. Altrimenti pipeline manuale: motore → `biber` (se esiste `.bcf`) o `bibtex` (se l'`.aux` ha `\bibdata`) → motore → terza passata se il log chiede "Rerun".
   - `bibtex` viene eseguito nella directory di output con `BIBINPUTS`/`BSTINPUTS` puntati alla radice progetto;
   - `biber` con `--input-directory`/`--output-directory`.
3. Argomenti fissi: `-interaction=nonstopmode -file-line-error -halt-on-error -output-directory=<out>`.
4. `-shell-escape` **mai** di default (solo esplicito da impostazioni, con avviso).

## Test manuali (checklist)

1. `npm run tauri dev` avvia l'app senza errori.
2. "Apri cartella" → aprire `examples/demo-article` → albero file visibile con icone corrette.
3. Aprire `main.tex` → tab attiva, evidenziazione, numeri di riga.
4. Modificare → pallino dirty nella tab e "modificato" nella status bar; Ctrl/Cmd+S salva e azzera.
5. Premere "Compila" → output in streaming nel pannello, PDF nel pannello destro dopo la build.
6. Introdurre `\comandoinesistente` nel main → ricompilare → errore in "Problemi" con file e riga → il click apre il file alla riga giusta.
7. Interrompi durante una build lunga → pipeline annullata, status "annullata".
8. Togliere la rete (o controllare) → tutto continua a funzionare: nessuna chiamata obbligatoria.
9. Impostazioni: cambiare tema, font, word wrap → effetto immediato; riavvio → persistono.
10. Nuovo progetto → scegliere template/cartella/nome → cartella creata con i 5 file template e aperta.
11. Modificare un file aperto con un editor esterno → avviso "modificato esternamente" → "Ricarica" aggiorna il contenuto.
12. Con LaTeX non installato: schermata iniziale con istruzioni TeX Live/MiKTeX/TinyTeX e status bar "non trovato".
13. Autosave on + attesa del debounce → file salvato su disco senza Ctrl+S.
14. Ctrl/Cmd+clic su un `\ref` esistente → salto alla riga del `\label`.

## Sicurezza

- Ogni comando fs Rust valida che il percorso risolva **dentro la radice progetto** (no `..`, no assoluti esterni, symlink ignorati nell'albero).
- I processi LaTeX partono con cwd = progetto o directory di output, argomenti costruiti solo da whitelist; nessun comando arbitrario configurabile dall'utente in questa versione.
- Nessun download automatico, nessuno script esterno eseguito, nessun dato inviato in rete.

## Limiti noti (v0.1)

- Nessuna ricerca "cross-file" nel progetto (solo nel file corrente).
- Rilevamento modifiche esterne a polling (4 s), non filesystem-watch.
- Il PDF passa per IPC in base64: per documenti di centinaia di MB servirebbe il protocollo asset (futuro).
- Parser dei log LaTeX euristico (i log spezzano le righe a 79 colonne).
- Nessun SyncTeX (click PDF → sorgente) — pianificato.
- Rinominare un file in un'estensione diversa non aggiorna l'evidenziazione finché non si riapre il file.
- La collaborazione (`src/collab/`) è solo architettura: nessuna funzione remota.

## Prossimi passi

1. Filesystem-watch nativo (tauri fs watcher) al posto del polling.
2. SyncTeX per forward/inverse search PDF ↔ sorgente.
3. Ricerca/sostituzione su tutto il progetto.
4. PDF via protocollo asset + cache pagine.
5. Fase 2 — collaborazione: implementare i provider in `src/collab/` (presence, sync documenti CRDT) restando file-first.

## Licenza

MIT — vedi [LICENSE](./LICENSE). I template in `templates/` sono originali e liberamente usabili.
