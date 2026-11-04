# LaTeX Editor Offline

Un editor LaTeX **originale e completamente offline** per Windows, Linux e
macOS: file sul disco, compilazione locale (latexmk o pipeline a passate),
anteprima PDF integrata. Nessun account, nessun server, nessuna telemetria.

> Progetto originale: codice, testi, modelli e icone sono stati scritti da
> zero per questo editor. Non contiene codice, risorse, testi o loghi di
> Overleaf o di altri prodotti.

## Caratteristiche (milestone 1)

- **Gestione progetto**: apertura di una cartella qualsiasi, albero file con
  creazione/rinomina/eliminazione, metadati in `.latex-editor/project.json`,
  progetti recenti.
- **Editor** (CodeMirror 6): evidenziazione LaTeX, più schede, completamento
  di comandi/ambienti/etichette/chiavi bibliografiche, snippet che chiudono
  gli ambienti, selezione rettangolare e multi-cursore (Ctrl+D), ricerca
  (Ctrl+F), Ctrl+S, salvataggio automatico con ritardo configurabile,
  rilevamento delle modifiche esterne.
- **Navigazione**: clic su `\ref{...}` per saltare alla `\label{...}`
  corrispondente (anche su file non aperti).
- **Compilazione**: rilevamento della distribuzione LaTeX, motori
  pdflatex/xelatex/lualatex, uso di `latexmk` quando disponibile con fallback
  a pipeline a passate (motore → biber/bibtex → motore → fino a 3 ripetizioni
  se il log le richiede), output in `.latex-editor/build`, compilazione
  cancellabile, log in streaming, elenco «Problemi» cliccabile.
- **Anteprima PDF** (PDF.js): aggiornata a ogni compilazione, zoom, adatta
  alla larghezza, navigazione pagine, ricarica manuale; in caso di errore
  resta a schermo l'ultimo PDF valido con un avviso.
- **Interfaccia**: quattro pannelli (albero · editor · output · PDF),
  pannelli laterali e inferiore richiudibili, tema scuro e chiaro, barra di
  stato.
- **Estensione futura della collaborazione**: `src/collab/` contiene solo le
  interfacce (`CollaborationProvider`, `PresenceProvider`,
  `DocumentSyncProvider`, `ProjectSyncProvider`) — nessuna implementazione,
  nessuna rete.

## Requisiti

- **Node.js ≥ 18** e npm
- **Rust ≥ 1.77** (https://rustup.rs)
- Una **distribuzione LaTeX** installata localmente (l'editor non scarica
  nulla):
  - Windows: [MiKTeX](https://miktex.org) o [TeX Live](https://www.tug.org/texlive/)
  - Linux: `sudo apt install texlive-latex-recommended texlive-latex-extra latexmk`
    (o la distribuzione della tua distro)
  - macOS: [MacTeX](https://www.tug.org/mactex/) o
    [TinyTeX](https://yihui.org/tinytex/) (`\usepackage` più comuni: booktabs,
    babel, hyperref, beamer)

## Sviluppo

```bash
npm install        # dipendenze frontend
npm run tauri dev  # avvia l'app in modalità sviluppo
```

Altri comandi utili:

```bash
npm run typecheck  # solo controllo tipi TypeScript
npm run build      # build del frontend (tsc + vite build)
```

## Eseguibili per Windows, Linux e macOS

### Build locale (sulla piattaforma di destinazione)

```bash
npm install
npm run tauri build
```

Gli artefatti compaiono in `src-tauri/target/release/bundle/`:

| Piattaforma | Formati prodotti | Percorso |
| --- | --- | --- |
| Windows | installer NSIS `.exe` + `.msi` | `bundle/nsis/`, `bundle/msi/` |
| Linux | `.AppImage`, `.deb`, `.rpm` | `bundle/appimage/`, `bundle/deb/`, `bundle/rpm/` |
| macOS | `.app` + `.dmg` | `bundle/macos/`, `bundle/dmg/` |

Note per piattaforma:

- **Windows**: l'installer incorpora WebView2 in modalità `offlineInstaller`
  (nessun download durante l'installazione; installer più grande, ~+130 MB).
  Per ridurre le dimensioni a favore della connessione, cambia
  `bundle.windows.webviewInstallMode` in `src-tauri/tauri.conf.json` in
  `downloadBootstrapper`.
- **Linux**: l'AppImage richiede FUSE; in alternativa estraila con
  `--appimage-extract`. Il `.deb` dichiara le dipendenze runtime
  (WebKitGTK 4.1).
- **macOS**: per un binario universale (Apple Silicon + Intel):
  `rustup target add aarch64-apple-darwin x86_64-apple-darwin` e poi
  `npm run tauri build -- --target universal-apple-darwin`.
- **Firma**: i binari prodotti non sono firmati. Windows mostra SmartScreen
  al primo avvio («Ulteriori informazioni → Esegui comunque»); su macOS usa
  tasto destro → Apri, oppure `xattr -cr "LaTeX Editor Offline.app"`. Per
  firmare: `signtool` (Windows) o `codesign`/`notarytool` (macOS, serve un
  Apple Developer ID).

### Build automatica con GitHub Actions (tutti e tre gli OS)

Il workflow `.github/workflows/build.yml` è già configurato:

- **manuale**: scheda *Actions* → *build* → *Run workflow* → scarica gli
  artefatti della run (uno per sistema operativo);
- **su tag**: `git tag v0.1.0 && git push origin v0.1.0` → viene creata una
  bozza di *Release* con tutti gli installer allegati.

## Architettura

```
┌──────────── React + TypeScript (UI nella webview) ────────────┐
│ Toolbar · FileTree · EditorTabs+CodeMirror 6 · PDF.js        │
│ OutputPanel (Problemi|Registro) · StatusBar · Dialoghi        │
│        Zustand store ←→ IPC tipizzata (invoke / eventi)       │
└──────────────────────────┬────────────────────────────────────┘
                           │ comandi Tauri + eventi
┌──────────────────────────┴────────────────────────────────────┐
│ Core Rust (offline)                                          │
│ sandbox fs · motore build asincrono · parser log             │
│ rilevamento LaTeX · template incorporati · impostazioni      │
└───────────────────────────────────────────────────────────────┘
```

- **Flusso di compilazione**: `start_build` valida i parametri, risolve gli
  eseguibili e avvia un task asincrono; l'output arriva nel frontend
  riga per riga con l'evento `build://output`; alla fine l'evento
  `build://finished` porta problemi (dal parser del `.log`) e percorso del
  PDF. `cancel_build` termina il processo corrente.
- **Sicurezza**: ogni percorso proveniente dalla UI viene validato e
  confinato nella cartella del progetto (canonicalizzazione + controllo di
  contenimento, quindi anche i link simbolici non sfuggono); i percorsi
  relativi rifiutano `..`; il motore è scelto da una whitelist; niente
  esecuzione di shell, niente rete. `-shell-escape` è **disattivato** per
  impostazione predefinita e, se attivato, viene mostrato un avviso.
- **Dati**: i progetti restano normali cartelle su disco
  (`.latex-editor/project.json`, `.latex-editor/settings.json`,
  output in `.latex-editor/build/`). Nessun formato proprietario: i file
  `.tex` restano tali.

## Struttura del repository

```
latex-editor-offline/
├── package.json  tsconfig.json  vite.config.ts  index.html
├── .github/workflows/build.yml      # CI multi-OS (eseguibili)
├── examples/demo-article/           # progetto dimostrativo
├── templates/{article,report,book,beamer,thesis}/
├── scripts/generate_icons.py        # rigenera le icone originali
├── src/
│   ├── main.tsx  App.tsx  path-independent UI entry
│   ├── components/   Toolbar, StatusBar, dialoghi
│   ├── filetree/     albero dei file + menu contestuale
│   ├── editor/       CodeMirror 6 (linguaggio, completamenti, schede)
│   ├── pdf/          anteprima PDF.js
│   ├── features/     project (benvenuto/nuovo), build (output), settings
│   ├── state/        store Zustand + autosave
│   ├── tauri/        layer IPC tipizzato (comandi + eventi)
│   ├── collab/       SOLO interfacce per la collaborazione futura
│   ├── types/  utils/  styles/
└── src-tauri/
    ├── Cargo.toml  tauri.conf.json  capabilities/default.json
    ├── icons/      PNG/ICO/ICNS originali
    └── src/
        ├── main.rs  lib.rs
        ├── error.rs  sandbox.rs  settings.rs  state.rs
        ├── latex.rs        (rilevamento distribuzione)
        ├── log_parser.rs   (problemi dal .log)
        ├── build_engine.rs (latexmk / pipeline, cancellabile)
        ├── templates.rs    (modelli incorporati con include_str!)
        └── commands/       (fs, impostazioni, latex, build, template)
```

### Comandi Tauri esposti

`open_project`, `read_file_tree`, `read_file`, `write_file`, `create_entry`,
`rename_entry`, `delete_entry`, `stat_file`, `read_pdf_bytes`,
`get_global_settings`, `save_global_settings`, `get_project_settings`,
`save_project_settings`, `detect_latex_installation`, `start_build`,
`cancel_build`, `read_build_output`, `get_built_pdf_path`, `list_templates`,
`create_project_from_template`.

## Scorciatoie da tastiera

| Combinazione | Azione |
| --- | --- |
| Ctrl/Cmd+S | salva il file attivo |
| Ctrl/Cmd+F | ricerca nel file |
| Ctrl/Cmd+D | aggiunge il cursore sull'occorrenza successiva |
| Ctrl/Cmd+Z / Ctrl/Cmd+Y | annulla / rifai |
| Tab | indentazione (fuori dai completamenti) |
| Ctrl+F9 | compila il progetto |
| Ctrl+spazio | suggerimenti di completamento |
| clic su `\ref{...}` | salta alla `\label{...}` |

## Decisioni progettuali documentate

1. **Zustand** invece di React Context: aggiornamenti selettivi senza
   re-render globali, API minimale, dipendenza di ~1 kB.
2. **Tema scuro e chiaro** (le specifiche permettevano entrambi): variabili
   CSS + tema CodeMirror corrispondente.
3. **Selezione cartelle con il plugin dialog ufficiale** (livello UI)
   invece di un comando custom: è il gestore multipiattaforma del thread
   principale più robusto nelle versioni attuali di Tauri.
4. **PDF via IPC binaria raw** (`tauri::ipc::Response`) invece del
   protocollo asset: nessuna configurazione di protocollo, trasferimento
   binario efficiente e cache-busting implicito (il file viene riletto dal
   disco a ogni caricamento).
5. **Modelli incorporati con `include_str!`**: un'unica fonte di verità nel
   repository, niente risorse da imballare.
6. **Parser del log euristico** (file:line, `!`, `l.NN`, avvisi comuni):
   copre i casi principali; il tracciamento completo dello stack dei file
   TeX è rimandato a una milestone successiva.
7. **`webviewInstallMode: offlineInstaller` su Windows** per rispettare il
   vincolo «completamente offline» (a costo di un installer più grande;
   alternativa documentata sopra).
8. **UI in italiano**, codice e identificatori in inglese (convenzione da
   toolchain); i messaggi Rust per l'utente sono in italiano.
9. **Autosave attivo di default** (1500 ms), disattivabile; il salvataggio
   è atomico (file temporaneo + rinomina).
10. **Timeout di 600 s per passo** di compilazione per non lasciare processi
    appesi in eterno.
11. **Beamer incluso tra i modelli** ma richiede il pacchetto `beamer`
    (presente nelle distribuzioni complete; segnalato nel README del
    modello).
12. **Nessun aggiornamento automatico dell'app**: coerente con il vincolo
    offline.

## Checklist di collaudo manuale

1. `npm install` e `npm run tauri dev`: la finestra si apre con la schermata
   di benvenuto e il riquadro sullo stato di LaTeX.
2. «Apri cartella progetto» su `examples/demo-article`: l'albero mostra i
   file, `main.tex` aprendosi mostra l'evidenziazione.
3. Digita `\sec` + Ctrl+spazio: il completamento propone `\section`; gli
   ambienti proposti in `\begin{` si chiudono automaticamente.
4. Ctrl+S: il puntino «non salvato» sulla scheda scompare.
5. Disattiva l'autosave in Impostazioni, modifica un file e attendi: il file
   NON cambia su disco; riattivalo e verifica il salvataggio automatico.
6. «Compila»: il registro si riempie in tempo reale e il PDF compare a
   destra; naviga le pagine, prova zoom e «Adatta».
7. Introduci `\comandonondefinito` e ricompila: nell'elenco Problemi
   compare la riga corrispondente; un clic porta il cursore sul punto
   giusto e il PDF precedente resta visibile con l'avviso.
8. Cancella la riga sbagliata, ricompila e verifica lo stato «successo».
9. Clic su `\eqref{eq:demo}` nel testo: il cursore salta alla riga
   dell'etichetta.
10. Tasto destro su un file nell'albero: Rinomina → la scheda aperta segue
    il nuovo nome; Elimina → la scheda si chiude.
11. Modifica `main.tex` con un altro editor mentre è aperto qui: al ritorno
    in primo piano appare il dialogo «File modificati all'esterno».
12. «Nuovo progetto» → modello «Articolo» → cartella e nome: il progetto si
    apre e compila al primo colpo.
13. Impostazioni: cambia tema, dimensione carattere e ritorno a capo:
    l'editor si aggiorna al volo; dopo riavvio le preferenze restano.
14. Con LaTeX assente dal PATH (o con la cartella «aggiuntiva» vuota):
    il riquadro mostra le indicazioni di installazione senza scaricare nulla.
15. `npm run tauri build` sulla tua piattaforma: gli installer compaiono in
    `src-tauri/target/release/bundle/` e l'app installata si avvia.

## Limitazioni note (milestone 1)

- Il parser del log è euristico: gli errori `! ...` senza riga `l.N` non
  riportano il file (viene usato il file principale); nessun tracciamento
  dello stack dei file aperti.
- Etichette e chiavi bibliografiche provengono dai file **aperti** (il
  salto `\ref` cerca però in tutto il progetto).
- Niente SyncTeX: nessun clic sul PDF per andare alla sorgente (e viceversa).
- Niente evidenziazione della struttura (outline), piegatura del codice,
  ricerca globale su più file, controllo ortografico.
- PDF.js senza `cmaps`: alcuni PDF con testi CJK possono non estrarre il
  testo (la resa resta di solito corretta).
- Una sola finestra; nessun aggiornamento automatico.
- Il bundle JavaScript è unico (≈1,1 MB + worker PDF.js): irrilevante su
  desktop, ma suddividibile in futuro.
- La verifica Rust in ambiente di sviluppo è stata eseguita con
  `cargo check` (Tauri 2.12, zero errori e zero avvisi) usando stub
  pkg-config per le librerie grafiche assenti; il linking finale e
  l'avvio dell'app richiedono le librerie reali (webkit2gtk-4.1, GTK 3)
  — proprio ciò che la CI installa su ogni sistema operativo.

## Prossimi passi (roadmap)

1. SyncTeX per il salto PDF↔sorgente.
2. Outline del documento (sezioni/etichette) e piegatura del codice.
3. Ricerca e sostituzione su tutto il progetto.
4. Tracciamento completo dei file nel parser del log.
5. Controllo ortografico offline (hunspell) per l'italiano.
6. Conteggio parole e statistiche del documento.
7. Implementazione opzionale della collaborazione dietro le interfacce di
   `src/collab/` (nessuna modifica al core richiesto dalle specifiche).

## Licenze

- Questo progetto: **MIT** (vedi `LICENSE`).
- Dipendenze principali e relative licenze:

| Dipendenza | Licenza |
| --- | --- |
| tauri, tauri-plugin-dialog | MIT o Apache-2.0 |
| tokio, serde, serde_json | MIT |
| which | MIT |
| regex | MIT o Apache-2.0 |
| thiserror | MIT o Apache-2.0 |
| react, react-dom | MIT |
| codemirror (@codemirror/*, theme-one-dark) | MIT |
| pdfjs-dist | Apache-2.0 |
| zustand | MIT |
| vite, @vitejs/plugin-react | MIT |
| typescript | Apache-2.0 |

I contenuti dei modelli in `templates/` e dell'esempio in `examples/` sono
segnaposto originali, utilizzabili liberamente nei tuoi documenti.
