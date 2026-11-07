# LaTeX Editor Offline

[![Build installers](https://github.com/MarioW98/LaTeX-Editor-Offline/actions/workflows/build.yml/badge.svg)](https://github.com/MarioW98/LaTeX-Editor-Offline/actions/workflows/build.yml)

Un editor LaTeX **originale e completamente offline** per Windows, Linux e
macOS: file sul disco, compilazione locale (latexmk o pipeline a passate),
anteprima PDF integrata. Nessun account, nessun server, nessuna telemetria.
L'app va in rete SOLO se premi tu «Controlla aggiornamenti» (vedi la
sezione [«Aggiornamenti»](#aggiornamenti-opt-in)): mai all'avvio, mai in
automatico.

> Progetto originale: codice, testi, modelli e icone sono stati scritti da
> zero per questo editor. Non contiene codice, risorse, testi o loghi di
> Overleaf o di altri prodotti.

## 📖 Manuale d'uso

**[Manuale d'uso completo in italiano](docs/manuale.md)** — installazione
(inclusi gli avvisi SmartScreen/Gatekeeper e i prerequisiti LaTeX), uso
dell'interfaccia e delle scorciatoie, compilazione, modelli, struttura dei
documenti e risoluzione dei problemi.

**[Manuale d'uso in PDF (A4)](docs/manuale.pdf)** — copertina, indice e le
sezioni del manuale, pronto da **scaricare, stampare o archiviare offline**.
Nota: il PDF è l'edizione 1.0 del manuale (riferita all'app 0.1.x); per la
documentazione aggiornata — inclusa la sezione aggiornamenti — fai riferimento
alla versione web qui sopra.

## Scarica l'app (installatori pronti)

Gli installatori per Windows, Linux e macOS sono pubblicati automaticamente
nella pagina [**Releases**](https://github.com/MarioW98/LaTeX-Editor-Offline/releases)
a ogni push su `main` (rilascio «latest», sempre aggiornato) e per ogni tag
`v*` (rilascio versionato). **Nessun login necessario per scaricarli.**
I file pubblicati hanno **nomi fissi**: si possono scaricare anche con i
link diretti qui sotto.

### Download diretto (build «latest»)

| Sistema | File (clic per scaricare) | Come installare |
| --- | --- | --- |
| Windows 10/11 (64 bit) | [LaTeX-Editor-Offline-windows-x64.msi](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-windows-x64.msi) — **unico installer Windows** | Doppio clic; se SmartScreen avvisa: «Ulteriori informazioni» → «Esegui comunque» |
| Linux (Ubuntu/Debian) | [LaTeX-Editor-Offline-linux-amd64.deb](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-linux-amd64.deb) | `sudo dpkg -i ./*.deb` oppure doppio clic → «Installa» |
| Linux (altre distribuzioni) | [LaTeX-Editor-Offline-linux-amd64.AppImage](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-linux-amd64.AppImage) | `chmod +x ./*.AppImage` poi doppio clic |
| macOS (Apple Silicon) | [LaTeX-Editor-Offline-macos-aarch64.dmg](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-macos-aarch64.dmg) | Apri il .dmg, trascina l'app in *Applicazioni*; primo avvio: clic destro → «Apri» |

> Se un link diretto risulta temporaneamente non disponibile, il rilascio
> «latest» si sta rigenerando in seguito a un push: usa la pagina
> [Releases](https://github.com/MarioW98/LaTeX-Editor-Offline/releases),
> i file hanno gli stessi nomi.

> Per compilare i documenti serve un compilatore LaTeX già installato:
> MiKTeX (Windows) · TeX Live (Linux) · MacTeX (macOS). L'app lo rileva
> automaticamente all'avvio.

## Aggiornamenti (opt-in)

L'editor resta **completamente offline**: progetti, compilazione, anteprima
PDF e impostazioni non toccano mai la rete. L'unica eccezione è una, ed è
una scelta tua:

- **L'app controlla gli aggiornamenti SOLO quando premi «Controlla
  aggiornamenti»** nella barra superiore. Non esiste alcun controllo
  automatico: né all'avvio, né in background, né dopo la compilazione.
- **Nessuna telemetria**: il controllo scarica solo `latest.json` (versione,
  data, note) dal rilascio più recente; l'app non invia alcun dato.
- **Gli aggiornamenti sono firmati e verificati**: ogni pacchetto di update
  è firmato con minisign e l'app rifiuta pacchetti la cui firma non verifica
  contro la chiave pubblica del maintainer incorporata nell'app.
- **Update solo dai rilasci versionati** (`v*`): il rilascio «latest» che si
  aggiorna a ogni push su `main` è una prerelease e l'updater non la
  considera mai.
- **Flusso esplicito**: «Controlla aggiornamenti» → Scarica aggiornamento →
  Installa e riavvia. Prima di installare, l'app salva su disco TUTTI i
  file non ancora salvati; su Windows l'app si chiude durante
  l'installazione (limitazione degli installer) e riapre al termine.
- Se non premi mai il pulsante, l'app resta offline per sempre: nessun
  traffico di rete in background.

Chi preferisce aggiornare a mano può continuare a farlo: gli installer degli
ultimi rilasci restano nella pagina [Releases](https://github.com/MarioW98/LaTeX-Editor-Offline/releases)
e un `.msi` con versione più recente si installa sopra quello esistente
senza disinstallare nulla.

## Caratteristiche (milestone 1)

- **Gestione progetto**: apertura di una cartella qualsiasi, albero file con
  creazione/rinomina/eliminazione, impostazioni per progetto in
  `.latex-editor/settings.json`, progetti recenti nelle impostazioni app.
- **Editor** (CodeMirror 6): evidenziazione LaTeX originale (tokenizzatore
  StreamLanguage), più schede con indicatore «non salvato», completamento dei
  comandi `\` più comuni (Ctrl+spazio), ricerca nel file (Ctrl+F),
  cronologia annulla/rifai, piegatura del codice, ritorno a capo, Ctrl+S,
  salvataggio automatico con ritardo configurabile (1200 ms), multi-cursore e
  selezione rettangolare.
- **Compilazione**: rilevamento della distribuzione LaTeX sempre visibile
  (chip «LaTeX» nella barra di stato, cliccabile per il dettaglio), gate
  prima di ogni compilazione — senza distribuzione (o senza il motore
  scelto) la build non parte e si apre la finestra di guida «Impossibile
  compilare»; motori pdflatex/xelatex/lualatex, uso di `latexmk` quando
  disponibile con fallback a pipeline a passate (motore → biber/bibtex →
  motore → motore), output in `.latex-editor/build`, compilazione
  cancellabile, log in streaming, errori con file:linea cliccabili.
- **Anteprima PDF** (PDF.js): aggiornata a ogni compilazione, zoom, adatta
  alla larghezza, navigazione pagine, ricarica manuale; in caso di errore
  resta a schermo l'ultimo PDF valido con un avviso.
- **Interfaccia**: quattro pannelli (albero · editor · output · PDF),
  pannelli laterale e inferiore richiudibili, tema scuro (le variabili per il
  tema chiaro sono già in `styles/theme.css`, pronte per un futuro selettore),
  barra di stato.
- **Estensione futura della collaborazione**: `src/collab/` contiene solo le
  interfacce (`CollaborationProvider`, `PresenceProvider`,
  `DocumentSyncProvider`, `ProjectSyncProvider`) — nessuna implementazione,
  nessuna rete.

## Requisiti

Per **compilare** serve una **distribuzione LaTeX installata sul computer**
(MiKTeX o TeX Live): l'editor **non la include** e resta completamente
offline — nessuna funzionalità scarica nulla, nemmeno i pacchetti LaTeX.

- Windows: [MiKTeX](https://miktex.org) o [TeX Live](https://www.tug.org/texlive/)
- Linux: `sudo apt install texlive-latex-recommended texlive-latex-extra latexmk`
  (o la distribuzione della tua distro)
- macOS: [MacTeX](https://www.tug.org/mactex/) o
  [TinyTeX](https://yihui.org/tinytex/) (`\usepackage` più comuni: booktabs,
  babel, hyperref, beamer)

Dopo l'installazione **riavvia l'app**. Lo stato degli strumenti è visibile
sempre, senza click: il **chip «LaTeX» nella barra di stato** —
«LaTeX: pronto (latexmk)», «LaTeX: pronto (pdflatex)» (senza latexmk) o
«LaTeX: assente». Un click sul chip apre il dettaglio: l'elenco
pdflatex/xelatex/lualatex/latexmk/bibtex/biber con ✓/✗ e versione, il
pulsante «Rileggi» e, se non c'è nulla, la guida per installare una
distribuzione. Se compili senza distribuzione (o senza il motore scelto),
la compilazione non parte affatto: si apre la finestra **«Impossibile
compilare»** con le stesse indicazioni — mai un errore tecnico grezzo.

Per **sviluppare** servono in più:

- **Node.js ≥ 22** e npm (il repo ha `engines: { node: ">=22" }`: i test
  usano `node --test --experimental-strip-types`, che richiede Node ≥ 22.6)
- **Rust ≥ 1.77** (https://rustup.rs)

## Sviluppo

```bash
npm install        # dipendenze frontend
npm run tauri dev  # avvia l'app in modalità sviluppo
```

Altri comandi utili:

```bash
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
| Windows | **`.msi`** (installer unico) | `bundle/msi/` |
| Linux | `.AppImage`, `.deb` | `bundle/appimage/`, `bundle/deb/` |
| macOS | `.dmg` (contiene l'app) | `bundle/dmg/` |

Su Windows viene prodotto **un solo installer, il `.msi`**. Se vuoi anche
il setup NSIS `.exe`, aggiungi `"nsis"` a `bundle.targets` in
`src-tauri/tauri.conf.json` (e riaggiungilo al workflow).

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
- **Firma**: i binari NON hanno firma di sistema operativo — Windows mostra
  SmartScreen al primo avvio («Ulteriori informazioni → Esegui comunque»);
  su macOS usa tasto destro → Apri, oppure `xattr -cr "LaTeX Editor
  Offline.app"`. Per firmare a livello di OS: `signtool` (Windows) o
  `codesign`/`notarytool` (macOS, serve un Apple Developer ID).
  **Firma degli aggiornamenti** (cosa diversa): con `createUpdaterArtifacts`
  attivo e le variabili `TAURI_SIGNING_PRIVATE_KEY[…]` impostate, il build
  produce anche i `.sig` minisign verificati dall'updater in-app.

### Build automatica con GitHub Actions (tutti e tre gli OS)

Il workflow `.github/workflows/build.yml` compila gli installer su Windows,
Linux e macOS a ogni push e li pubblica nella pagina
[Releases](https://github.com/MarioW98/LaTeX-Editor-Offline/releases)
con **nomi fissi** (link diretti nel README, sopra):

- **push su `main`** → aggiorna il rilascio «latest» (pre-release) con
  un solo file per sistema: `.msi` (Windows), `.deb` + `.AppImage` (Linux),
  `.dmg` (macOS), scaricabili senza login;
- **push di un tag** (`git tag v0.2.0 && git push origin v0.2.0`) → crea il
  rilascio versionato con note generate automaticamente, **più** gli
  artifact updater firmati (`.msi.sig`, `.AppImage.sig`, `.app.tar.gz` +
  `.sig`) e `latest.json`, l'indice che l'app scarica solo su richiesta
  esplicita dell'utente (vedi [«Aggiornamenti»](#aggiornamenti-opt-in));
- **manuale**: scheda *Actions* → *Build installers* → *Run workflow*.

I file restano disponibili anche come artefatti della singola run nella
scheda *Actions* (per scaricarli occorre essere autenticati su GitHub).

Ogni job della matrice pubblica inoltre l'**eseguibile portatile** (il
binario release *non* installato) come artefatto separato della run:
`latex-editor-portable-windows` (`.exe`), `latex-editor-portable-linux`
(binario) e `latex-editor-portable-macos` (`.app` zippata). Si scarica
dalla scheda *Actions*, si esegue direttamente e **non tocca l'eventuale
versione installata**: il modo più rapido per provare una build senza
disinstallare nulla. Il workflow ne verifica la presenza con `ls` e
fallisce se l'artefatto manca.

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

- **Flusso di compilazione**: `start_build` valida i parametri, risolve il
  file principale e avvia un thread di monitoraggio; l'output arriva nel
  frontend riga per riga con l'evento `build-output`; alla fine l'evento
  `build-finished` porta esito, durata e percorso del PDF. `cancel_build`
  termina il processo corrente.
- **Sicurezza**: ogni percorso proveniente dalla UI viene ricomposto
  componente per componente e i componenti assoluti e `..` vengono
  rifiutati, quindi ogni accesso resta confinato nella cartella del progetto
  scelta; il motore è scelto da una whitelist (pdflatex/xelatex/lualatex);
  niente esecuzione di shell arbitrarie. `-shell-escape` è
  **disattivato** per impostazione predefinita e l'interfaccia ne spiega i
  rischi quando lo attivi. L'unico accesso alla rete è il comando
  esplicito di aggiornamento (vedi sopra): tutto il resto è offline.
- **Dati**: i progetti restano normali cartelle su disco
  (`.latex-editor/settings.json` per progetto, output in
  `.latex-editor/build/`). Nessun formato proprietario: i file `.tex` restano
  tali.

## Struttura del repository

```
latex-editor-offline/
├── package.json  tsconfig.json  vite.config.ts  index.html
├── .github/workflows/build.yml      # CI multi-OS (eseguibili)
├── examples/demo-article/           # progetto dimostrativo
├── templates/{article,report,book,beamer,thesis}/
├── scripts/generate_icons.py        # rigenera le icone originali
├── src/
│   ├── main.tsx  App.tsx  api.ts (layer IPC tipizzato: 16 comandi)
│   ├── components/   TopBar, StatusBar, Welcome, SettingsDialog
│   ├── filetree/     albero dei file + menu contestuale
│   ├── editor/       EditorPane (schede) + latex.ts (linguaggio, tema,
│   │                 evidenziazione, completamenti — tutto originale)
│   ├── build/        pannello output: log, contatori, errori cliccabili
│   ├── pdf/          anteprima PDF.js (zoom, adatta, ricarica)
│   ├── features/     templates.ts (i 5 modelli originali)
│   ├── state/        store Zustand (tab, buffer, build, impostazioni,
│   │                 macchina a stati degli aggiornamenti opt-in)
│   ├── updater/      updaterService.ts — l'UNICO punto che importa i
│   │                 plugin di aggiornamento (rete solo su comando)
│   ├── collab/       SOLO interfacce per la collaborazione futura
│   ├── styles/  types.ts  vite-env.d.ts
└── src-tauri/
    ├── Cargo.toml  Cargo.lock  tauri.conf.json  capabilities/default.json
    ├── icons/      PNG/ICO/ICNS originali
    └── src/
        ├── main.rs     (finestra + registro dei 16 comandi)
        ├── error.rs  state.rs
        └── commands/
            ├── project.rs   (fs sandbox + selezione cartella via rfd)
            ├── latex.rs    (rilevamento, pipeline build, log, PDF bytes)
            └── settings.rs (impostazioni app + progetto)
```

### Comandi Tauri esposti

`select_project_folder`, `read_file_tree`, `read_file`, `write_file`,
`create_item`, `rename_item`, `delete_item`, `detect_latex`, `start_build`,
`cancel_build`, `read_build_log`, `read_pdf_bytes`, `get_project_settings`,
`save_project_settings`, `get_app_settings`, `save_app_settings`.

## Scorciatoie da tastiera

| Combinazione | Azione |
| --- | --- |
| Ctrl/Cmd+S | salva il file attivo |
| Ctrl/Cmd+F | ricerca nel file |
| Ctrl/Cmd+Z / Ctrl/Cmd+Y | annulla / rifai |
| Tab | indentazione (fuori dai completamenti) |
| F5 | compila il progetto |
| Ctrl+spazio | suggerimenti di completamento |
| clic su una riga `file:linea` d'errore | porta il cursore sul punto giusto |

## Decisioni progettuali documentate

1. **Zustand** invece di React Context: aggiornamenti selettivi senza
   re-render globali, API minimale, dipendenza di ~1 kB.
2. **Tema scuro** con variabili CSS (`theme.css` contiene già le variabili
   per il tema chiaro: un futuro selettore non richiede modifiche al codice
   dei componenti).
3. **Selezione cartelle con `rfd` lato Rust** (comando
   `select_project_folder` con `spawn_blocking`): dialogo nativo di sistema
   senza plugin JavaScript, zero permessi extra in `capabilities/` e zero
   rete.
4. **PDF via IPC binaria raw** (`tauri::ipc::Response`) invece del
   protocollo asset: nessuna configurazione di protocollo, trasferimento
   binario efficiente e cache-busting implicito (il file viene riletto dal
   disco a ogni caricamento).
5. **Modelli in TypeScript** (`src/features/templates.ts`): un'unica fonte
   di verità lato UI, scritti da zero; la cartella `templates/` del repo ne
   conserva una copia in formato progetto.
6. **Classificazione del log in streaming** (righe `file:linea` degli
   errori, righe che iniziano con `!`, avvisi comuni): copre i casi
   principali; il tracciamento completo dello stack dei file TeX è rimandato
   a una milestone successiva.
7. **`webviewInstallMode: offlineInstaller` su Windows** per rispettare il
   vincolo «completamente offline» (a costo di un installer più grande;
   alternativa documentata sopra). **Un solo installer Windows (.msi)**:
   il bundle NSIS non viene più prodotto di default.
8. **UI in italiano**, codice e identificatori in inglese (convenzione da
   toolchain); i messaggi Rust per l'utente sono in italiano.
9. **Autosave attivo di default** (1200 ms), disattivabile dalle
   impostazioni del progetto.
10. **Beamer incluso tra i modelli** ma richiede il pacchetto `beamer`
    (presente nelle distribuzioni complete; segnalato nel README del
    modello).
11. **Aggiornamenti solo su richiesta esplicita**: l'app non fa MAI check
    automatici (né all'avvio né in background) e non ha telemetria; la rete
    si tocca solo al click su «Controlla aggiornamenti». I pacchetti di
    update sono firmati minisign e verificati contro la pubkey incorporata;
    l'endpoint punta all'ultimo rilascio versionato (le prerelease sono
    saltate). In passato la decisione era «nessun aggiornamento in-app»: è
    cambiata in «opt-in firmato» mantenendo il vincolo offline per tutto
    il resto.

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
7. Introduci `\comandonondefinito` e ricompila: nel pannello output compare
   la riga d'errore corrispondente (contatore incluso); un clic sulla riga
   `file:linea` porta il cursore sul punto giusto e il PDF precedente resta
   visibile.
8. Cancella la riga sbagliata, ricompila e verifica lo stato «successo».
9. Tasto destro su un file nell'albero: Rinomina → la scheda aperta segue
   il nuovo nome; Elimina → la scheda si chiude.
10. «Nuovo progetto» → modello «Articolo» → cartella e nome: il progetto si
    apre e compila al primo colpo.
11. Impostazioni: cambia motore, dimensione carattere e autosave: l'editor
    si aggiorna al volo; dopo riavvio le preferenze del progetto restano.
12. Con LaTeX assente dal PATH: il riquadro mostra le indicazioni di
    installazione senza scaricare nulla.
13. `npm run tauri build` sulla tua piattaforma: gli installer compaiono in
    `src-tauri/target/release/bundle/` e l'app installata si avvia.

## Limitazioni note (milestone 1)

- La classificazione del log è euristica: gli errori `! ...` senza riga
  `file:linea` non riportano il file; nessun tracciamento dello stack dei
  file aperti.
- I completamenti sono un elenco statico di comandi `\` comuni: non
  estraggono etichette né chiavi bibliografiche dai file aperti.
- Niente SyncTeX: nessun clic sul PDF per andare alla sorgente (e viceversa).
- Niente outline/struttura del documento, ricerca globale su più file,
  controllo ortografico, rilevamento di modifiche esterne ai file.
- PDF.js senza `cmaps`: alcuni PDF con testi CJK possono non estrarre il
  testo (la resa resta di solito corretta).
- Una sola finestra; nessun controllo AUTOMATICO degli aggiornamenti: si
  aggiornano solo premendo «Controlla aggiornamenti».
- Il bundle JavaScript è unico (≈0,9 MB + worker PDF.js): irrilevante su
  desktop, ma suddividibile in futuro.
- Il lato Rust è stato verificato con una revisione statica completa
  (coerenza moduli, crate, firme comandi/frontend, `Cargo.lock`) e viene
  compilato dalla CI su Windows, Linux e macOS a ogni push.

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
| tauri, tauri-build, serde, serde_json | MIT o Apache-2.0 |
| tauri-plugin-updater, tauri-plugin-process (aggiornamenti opt-in) | MIT o Apache-2.0 |
| @tauri-apps/plugin-updater, @tauri-apps/plugin-process (binding JS) | MIT o Apache-2.0 |
| rfd (dialoghi nativi) | MIT o Apache-2.0 |
| regex | MIT o Apache-2.0 |
| once_cell | MIT o Apache-2.0 |
| react, react-dom | MIT |
| codemirror (@codemirror/*, @lezer/highlight) | MIT |
| pdfjs-dist | Apache-2.0 |
| zustand | MIT |
| vite, @vitejs/plugin-react | MIT |
| typescript | Apache-2.0 |

I contenuti dei modelli in `templates/` e dell'esempio in `examples/` sono
segnaposto originali, utilizzabili liberamente nei tuoi documenti.
