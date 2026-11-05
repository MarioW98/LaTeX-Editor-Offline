# Manuale d'uso — LaTeX Editor Offline

Versione del manuale: 1.0 (app 0.1.x) · lingua: italiano · licenza dell'app: MIT

Benvenuto! Questo manuale copre tutto il percorso: installazione, uso
dell'interfaccia, compilazione, modelli e organizzazione dei documenti LaTeX,
fino alla risoluzione dei problemi. L'app è **completamente offline**: nessun
account, nessun server, nessuna telemetria; i progetti restano normali
cartelle sul tuo disco.

> Scorciatoie: [download](#2-requisiti-e-installazione) ·
> [primi passi](#3-primi-passi) · [interfaccia](#4-linterfaccia) ·
> [compilazione](#5-compilazione) · [tastiera](#7-scorciatoie-da-tastiera) ·
> [struttura documenti](#8-struttura-di-un-documento-latex) ·
> [problemi](#10-risoluzione-dei-problemi)

---

## Sommario

1. [Panoramica](#1-panoramica)
2. [Requisiti e installazione](#2-requisiti-e-installazione)
3. [Primi passi](#3-primi-passi)
4. [L'interfaccia](#4-linterfaccia)
5. [Compilazione](#5-compilazione)
6. [Impostazioni](#6-impostazioni)
7. [Scorciatoie da tastiera](#7-scorciatoie-da-tastiera)
8. [Struttura di un documento LaTeX](#8-struttura-di-un-documento-latex)
9. [Modelli inclusi](#9-modelli-inclusi)
10. [Risoluzione dei problemi](#10-risoluzione-dei-problemi)
11. [Privacy, dati e backup](#11-privacy-dati-e-backup)
12. [Aggiornamento e disinstallazione](#12-aggiornamento-e-disinstallazione)

---

## 1. Panoramica

LaTeX Editor Offline è un editor LaTeX «da scrivania» per Windows, Linux e
macOS, pensato per chi vuole lavorare **senza dipendenze dalla rete**:

- i progetti sono normali cartelle con file `.tex`, `.bib`, immagini ecc. —
  nessun formato proprietario, nessun database interno;
- la compilazione usa la distribuzione LaTeX già presente sul tuo computer
  (MiKTeX, TeX Live o MacTeX), con `latexmk` quando disponibile e una
  pipeline a passate multiple in alternativa;
- l'anteprima del PDF è integrata (rendering PDF.js locale);
- nessun account, nessuna sincronizzazione cloud, nessuna telemetria, nessun
  aggiornamento automatico: sei tu a decidere quando scaricare una nuova
  versione.

L'app non scarica mai nulla e non invia mai nulla in rete: se un compilatore
LaTeX manca, te lo dice e resta in attesa — non lo installa al posto tuo.

---

## 2. Requisiti e installazione

### 2.1 Download degli installatori

Gli installatori sono pubblicati nella pagina
[Releases](https://github.com/MarioW98/LaTeX-Editor-Offline/releases)
(del repository `MarioW98/LaTeX-Editor-Offline`), scaricabili **senza login**.
Il rilascio «latest» viene rigenerato a ogni aggiornamento del programma.
Windows ha **un unico installer: il file `.msi`**.

| Sistema | File (clic per il download diretto) | Dimensione indicativa |
| --- | --- | --- |
| Windows 10/11 (64 bit) | [LaTeX-Editor-Offline-windows-x64.msi](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-windows-x64.msi) | ≈ 200 MB (include WebView2) |
| Linux Ubuntu/Debian | [LaTeX-Editor-Offline-linux-amd64.deb](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-linux-amd64.deb) | ≈ 10 MB |
| Linux (altre distribuzioni) | [LaTeX-Editor-Offline-linux-amd64.AppImage](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-linux-amd64.AppImage) | ≈ 15 MB |
| macOS (Apple Silicon) | [LaTeX-Editor-Offline-macos-aarch64.dmg](https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/latest/LaTeX-Editor-Offline-macos-aarch64.dmg) | ≈ 15 MB |

Se un link diretto non funziona per qualche minuto, il rilascio «latest» sta
venendo rigenerato da un push appena avvenuto: usa in quel caso la pagina
Releases (i file hanno gli stessi nomi).

### 2.2 Prerequisito: una distribuzione LaTeX

L'editor **non include** il compilatore LaTeX: installane uno prima di
compilare il primo documento. Aprendo l'app, il riquadro «Distribuzione
LaTeX» nella schermata di benvenuto ti dice cosa è stato rilevato.

| Sistema | Distribuzione consigliata | Dove |
| --- | --- | --- |
| Windows | [MiKTeX](https://miktex.org) oppure [TeX Live](https://www.tug.org/texlive/) | installa e poi riavvia l'editor |
| Linux | TeX Live: `sudo apt install texlive-latex-recommended texlive-latex-extra latexmk` | opzionale ma consigliato `latexmk` |
| macOS | [MacTeX](https://www.tug.org/mactex/) oppure [TinyTeX](https://yihui.org/tinytex/) | MacTeX è la scelta completa |

Note:

- **MiKTeX su Windows**: può scaricare i pacchetti mancanti al primo uso
  («install missing packages on-the-fly»). Se vuoi lavorare davvero offline,
  imposta tale opzione su «Ask» e installa i pacchetti che ti servono mentre
  sei connesso, oppure installa direttamente TeX Live completa.
- `latexmk` non è obbligatorio: se manca, l'editor usa la propria sequenza
  multi-passaggio (vedi [5. Compilazione](#5-compilazione)). Con `latexmk`
  l'esperienza è però più affidabile.

### 2.3 Installazione su Windows (unico installer `.msi`)

1. Scarica `LaTeX-Editor-Offline-windows-x64.msi` (link in [2.1](#21-download-degli-installatori)).
2. Fai **doppio clic** sul file.
3. Segui la procedura guidata. Il programma viene installato per tutti gli
   utenti del computer.

L'installer **incorpora il runtime WebView2** in modalità «offline»: durante
l'installazione non viene scaricato nulla da internet (per questo il file è
grande, ~200 MB).

**Avviso SmartScreen (normale)** — l'app non è firmata digitalmente, quindi
Windows può mostrare «Windows ha protetto il PC»:

- nell'avviso, scegli **Ulteriori informazioni → Esegui comunque**;
- in alternativa: clic destro sul file → *Proprietà* → spunta **Sblocca** →
  *OK*, poi riavvia l'installazione.

Per disinstallare: *Impostazioni → App → App installate → LaTeX Editor
Offline → Disinstalla*. I tuoi progetti non vengono toccati (vedi
[11. Privacy, dati e backup](#11-privacy-dati-e-backup)).

### 2.4 Installazione su Linux

**Pacchetto `.deb`** (Ubuntu, Debian e derivate):

```bash
sudo dpkg -i LaTeX-Editor-Offline-linux-amd64.deb
# oppure, se mancano dipendenze:
sudo apt install ./LaTeX-Editor-Offline-linux-amd64.deb
```

oppure doppio clic sul file e «Installa» dal centro software.

**AppImage** (Fedora, Arch, openSUSE e altre):

```bash
chmod +x LaTeX-Editor-Offline-linux-amd64.AppImage
./LaTeX-Editor-Offline-linux-amd64.AppImage
```

L'AppImage richiede FUSE; se il tuo sistema lo blocca, estraila con
`./LaTeX-Editor-Offline-linux-amd64.AppImage --appimage-extract` e lancia
l'eseguibile nella cartella estratta. Il `.deb` dichiara da solo le proprie
dipendenze (WebKitGTK 4.1).

### 2.5 Installazione su macOS

1. Scarica `LaTeX-Editor-Offline-macos-aarch64.dmg` (build per Apple
   Silicon: M1/M2/M3 o successivi).
2. Aprilo e **trascina** l'app dentro *Applicazioni*.
3. Al **primo avvio** macOS mostra «non sviluppato da uno sviluppatore
   identificato»: fai **clic destro sull'app → Apri** (una volta sola), poi
   «Apri» nella finestra di conferma.

Su Mac Intel puoi compilarti una build universale dal sorgente (vedi il
README, sezione «Eseguibili»).

### 2.6 Primo avvio

All'apertura trovi la **schermata di benvenuto** con:

- **Apri una cartella progetto** — sceglie una cartella esistente sul disco;
- **Nuovo progetto da template** — crea un progetto pronto da un modello;
- **Distribuzione LaTeX** — cosa è stato rilevato sul sistema (motori
  disponibili, `latexmk` presente o meno, avvisi).

All'avvio successivo l'app riapre automaticamente l'ultimo progetto usato;
se la cartella non esiste più, torna alla schermata di benvenuto senza
errori.

---

## 3. Primi passi

### 3.1 Aprire un progetto esistente

1. «Apri una cartella progetto» (o **Apri cartella** nella barra in alto).
2. Scegli la cartella: l'albero dei file appare a sinistra.
3. Clic su un file `.tex`: si apre in una scheda nell'editor.

Puoi usare qualsiasi cartella: se contiene già un `main.tex`, viene aperto
automaticamente. L'esempio nel repository (`examples/demo-article`) è un
progetto dimostrativo pronto da aprire e compilare.

### 3.2 Creare un nuovo progetto da modello

1. Nella schermata di benvenuto: **Nuovo progetto da template**.
2. Scegli un modello (vedi [9. Modelli inclusi](#9-modelli-inclusi)).
3. Scrivi il nome del progetto (es. `tesi-2026`).
4. «Crea progetto» e scegli la **cartella padre** dove creare la cartella
   del progetto.

Vengono creati la struttura dei file, un piccolo README e le impostazioni;
il progetto si apre già attivo. Da qui in poi puoi sempre riprenderlo con
«Apri cartella».

### 3.3 Scrivere un documento nuovo da zero

Non serve partire da un modello:

1. «Apri una cartella progetto» e scegli (o crea prima con l'explorer) una
   cartella vuota.
2. Nella colonna dei file premi **+ file**, digita il nome, ad esempio
   `documento.tex`, e premi **Invio**.
3. Il file si apre nella scheda: **puoi scrivere subito**. Il primo file
   `.tex` creato diventa automaticamente il «file principale» se non ne
   esiste uno: la compilazione con **F5** funziona da subito, senza
   toccare le impostazioni.
4. Incolla uno scheletro minimo per iniziare:

```latex
\documentclass[a4paper,11pt]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage{hyperref}

\title{Il mio documento}
\author{Il mio nome}
\date{\today}

\begin{document}
\maketitle

\section{Introduzione}
Scrivi qui il tuo testo.

\end{document}
```

5. Premi **F5**: il log scorre nel pannello in basso e il PDF appare a
   destra.

Il salvataggio è automatico (dopo ~1,2 s di pausa nella digitazione);
**Ctrl+S** salva su richiesta. Vedi anche
[8. Struttura di un documento LaTeX](#8-struttura-di-un-documento-latex)
per organizzare testi lunghi.

---

## 4. L'interfaccia

La finestra è organizzata in quattro aree (più due barre):

```
┌───────────────────────── barra superiore ─────────────────────────┐
├───────────┬──────────────────────────────────┬────────────────────┤
│  Albero   │        Editor a schede           │   Anteprima PDF   │
│  dei file │   (CodeMirror 6, testo LaTeX)    │      (PDF.js)      │
├───────────┴──────────────────────────────────┴────────────────────┤
│                       Pannello output (log)                        │
├───────────────────────────────────────────────────────────────────┤
│                            barra di stato                          │
└───────────────────────────────────────────────────────────────────┘
```

I tre pannelli (File, Output, PDF) si mostrano/nascondono con i pulsanti
omonimi nella barra superiore.

### 4.1 Barra superiore

| Elemento | Funzione |
| --- | --- |
| **Apri cartella** | cambia progetto (selettore di cartelle di sistema) |
| selettore **pdflatex / xelatex / lualatex** | motore di compilazione (salvato nel progetto) |
| **Compila (F5)** / **Ferma compilazione** | avvia / interrompe la compilazione in corso |
| **File / Output / PDF** | mostra o nasconde i tre pannelli |
| **Impostazioni** | apre la finestra delle impostazioni del progetto |
| badge «N non salvati» | quanti file modificati non ancora salvati |

Il nome del progetto (nome della cartella) è visibile accanto al logo.

### 4.2 Albero dei file

- **+ file** / **+ cartella** — crea un elemento nella **radice del
  progetto**: compare un campo di testo; digita il nome e premi Invio
  (Esc annulla). Il file nuovo si apre subito nell'editor.
- **↻ (Aggiorna)** — rilegge la cartella dal disco (utile dopo aver
  spostato file con l'explorer di sistema).
- Clic su un **file** → lo apre in una scheda; clic su una **cartella** →
  la espande/comprime.
- Passando su una riga compaiono: **rin** (rinomina, Invio conferma) e
  **del** (elimina: il primo clic «arma» il pulsante, il secondo entro
  2,5 s elimina davvero — la radice del progetto non è eliminabile).
- Se il file rinominato era aperto, la scheda segue il nuovo nome;
  altrimenti riaprilo dall'albero.
- I file binari si aprono ma mostrano l'avviso «File binario»: non sono
  modificabili nell'editor.
- La cartella interna `.latex-editor` (impostazioni e output di build) non
  è mostrata.

Nota: con «+ file» i nuovi file vengono creati nella radice del progetto.
Per organizzarli in sottocartelle puoi creare prima le cartelle, spostare i
file con l'explorer di sistema e premere **↻** per aggiornare l'albero.

### 4.3 Editor e schede

- Una scheda per ogni file aperto; il **punto giallo** segnala modifiche
  non salvate; **×** chiude la scheda.
- **Evidenziazione** della sintassi LaTeX, chiusura automatica delle
  parentesi graffe, ritorno a capo attivo.
- **Ctrl+spazio** — completamento dei comandi `\` più comuni (ambienti in
  `\begin{…}` inclusi).
- **Ctrl+F** — ricerca nel file corrente.
- **Piegatura del codice** tramite i piccoli triangoli nel margine
  sinistro (ambienti, sezioni).
- **Multi-cursore**: Alt+clic (o selezione rettangolare) per modificare
  più punti insieme.
- Annulla/ripeti illimitato **Ctrl+Z / Ctrl+Y**.
- **Salvataggio automatico** dopo ~1,2 s di pausa (disattivabile), e
  **Ctrl+S** manuale.

### 4.4 Anteprima PDF

- Pulsanti **− / +**: zoom da 30% a 400% (percentuale visibile al centro);
  **Adatta**: pagina alla larghezza del pannello; **Ricarica**: rilegge il
  PDF dal disco.
- L'anteprima si aggiorna **da sola dopo ogni compilazione riuscita**;
  mostra fino a 60 pagine (i documenti più lunghi indicano il totale).
- Se la compilazione **fallisce**, resta a schermo l'ultimo PDF valido con
  l'errore nel pannello output: così non perdi il punto del documento
  mentre correggi.
- Se ancora non esiste alcun PDF: «Nessun PDF: compila il progetto per
  generarlo».

### 4.5 Pannello output

- Intestazione con **stato** (in corso / terminata con successo / con
  errori / in attesa) e **contatori errori e avvisi**; pulsanti **Ferma**
  (durante la compilazione) e **Pulisci** (svuota il log).
- Il log scorre in tempo reale durante la compilazione (il PDF appare al
  termine se ha successo).
- Le righe di errore **file:riga sono cliccabili**: un clic apre il file
  giusto e porta il cursore sulla riga esatta.
- Le stesse righe compaiono con colori: rosso errori, giallo avvisi.

### 4.6 Barra di stato

Da sinistra: **pallino** verde («LaTeX pronto (latexmk)»), giallo («LaTeX
pronto (multi-passaggio)», cioè senza latexmk), rosso («Distribuzione
LaTeX non rilevata»); esito e durata dell'ultima compilazione; file
principale e motore in uso; percorso completo del progetto aperto.

---

## 5. Compilazione

Premi **F5** o il pulsante **Compila**.

Cosa succede:

1. L'editor salva i buffer e lancia la compilazione del **file principale**
   (vedi [6. Impostazioni](#6-impostazioni)) con il motore scelto.
2. Se `latexmk` è disponibile viene usato (gestisce da solo le passate
   ripetute e la bibliografia). Altrimenti l'editor esegue la propria
   sequenza: motore → `biber`/`bibtex` (se serve, rilevato
   automaticamente) → motore → motore.
3. Tutti i file intermedi e il PDF finiscono nella cartella **interna**
   `.latex-editor/build` del progetto: la tua cartella resta pulita.
4. Durante l'esecuzione: log in streaming nel pannello output, pulsante
   **Ferma compilazione** per interrompere.
5. A fine corsa: esito, durata e (se riuscita) aggiornamento automatico
   dell'anteprima.

Dettagli utili:

- Parametri: `-interaction=nonstopmode -file-line-error` (il log resta
  completo anche con errori e le righe sono cliccabili).
- `-shell-escape` è **disattivato** per sicurezza; attivalo solo se un
  pacchetto lo richiede davvero (vedi impostazioni).
- L'opzione **Ricompila quando salvi il file principale** (autoBuild)
  rilancia la compilazione a ogni salvataggio del file principale.
- Un PDF già generato resta visibile anche quando la compilazione
  successiva fallisce.

---

## 6. Impostazioni

Finestra **Impostazioni** (barra superiore), validi per il progetto aperto
e salvati in `<progetto>/.latex-editor/settings.json`:

| Impostazione | Significato |
| --- | --- |
| **File principale** | il `.tex` che fa da radice della compilazione (default `main.tex`) |
| **Motore** | pdflatex / xelatex / lualatex |
| **Consenti -shell-escape** | off di default: attivalo solo se strettamente necessario |
| **Salvataggio automatico** | salva dopo ~1,2 s di pausa nella digitazione |
| **Ricompila automaticamente** | ricompila quando salvi il file principale |
| **Dimensione carattere editor** | 10–24 px, applicata subito |

Le preferenze dell'applicazione (ultimo progetto, progetti recenti) stanno
invece nella cartella dati dell'utente:

- Windows: `%APPDATA%\com.latexeditor.offline\settings.json`
- Linux: `~/.config/com.latexeditor.offline/settings.json`
- macOS: `~/Library/Application Support/com.latexeditor.offline/settings.json`

---

## 7. Scorciatoie da tastiera

| Combinazione | Azione |
| --- | --- |
| Ctrl/Cmd+S | salva il file attivo |
| Ctrl/Cmd+F | ricerca nel file |
| Ctrl/Cmd+Z / Ctrl/Cmd+Y | annulla / rifai |
| Tab | indentazione (fuori dai completamenti) |
| F5 | compila il progetto |
| Ctrl/Cmd+spazio | suggerimenti di completamento |
| Alt+clic | aggiungi un secondo cursore |
| clic su una riga `file:linea` d'errore | porta il cursore sul punto giusto |

Su macOS, Ctrl è in genere il tasto Cmd.

---

## 8. Struttura di un documento LaTeX

Un progetto LaTeX è fatto di normali file di testo nella cartella del
progetto. Ecco come si organizza di solito — e come l'editor lo tratta.

### 8.1 Il file principale

Ogni progetto ha un **file principale** (`main.tex` di default): è il file
che la compilazione parte a elaborare. Contiene:

- `\documentclass` — il tipo di documento (article, report, book, beamer…);
- il **preambolo** — i `\usepackage` e le impostazioni globali;
- `\begin{document} … \end{document}` — il corpo del testo.

Tutti gli altri file (capitoli, figure, bibliografia) vengono richiamati
dal file principale o dai file che esso include.

> Quando crei il tuo primo `.tex` con «+ file» in un progetto senza file
> principale, l'editor lo usa automaticamente come file principale.

### 8.2 Progetti multi-file: `\input` e `\include`

Per testi lunghi conviene un file per capitolo:

```latex
% in main.tex
\input{capitoli/introduzione}
\input{capitoli/metodo}
\include{capitoli/conclusioni}   % \include fa iniziare pagina nuova
```

Struttura tipica della cartella:

```
mio-progetto/
├── main.tex                 ← file principale (radice)
├── capitoli/
│   ├── introduzione.tex
│   ├── metodo.tex
│   └── conclusioni.tex
├── immagini/
│   ├── schema.png
│   └── grafico.pdf
├── bibliografia.bib          ← vedi 8.4
└── .latex-editor/            ← creato dall'app: impostazioni + build
```

Se un errore sta in un file incluso, la riga `file:linea` nel pannello
output è cliccabile come sempre: l'editor apre il file giusto al punto
giusto.

### 8.3 Immagini

Mettile in una cartella dedicata e dichiarala nel preambolo:

```latex
\usepackage{graphicx}
\graphicspath{{immagini/}}
...
\includegraphics[width=0.8\textwidth]{schema}
```

Si possono usare PDF, PNG, JPG (con pdflatex/xelatex/lualatex; PostScript
solo con latex+dvips, non usato qui). Le immagini restano file normali:
puoi sostituirle senza toccare l'editor.

### 8.4 Bibliografia

Crea un file `.bib` (i modelli ne includono uno d'esempio) e richiamalo:

```latex
% preambolo (biblatex + biber, consigliato)
\usepackage[backend=biber]{biblatex}
\addbibresource{bibliografia.bib}
...
\cite{knuth1986}
\printbibliography
```

L'editor **rileva da solo** se serve `biber` (biblatex) o `bibtex`
(classico `\bibliography{...}`) e inserisce la passata necessaria: non devi
fare nulla. Con `latexmk` è ancora più automatico.

### 8.5 Convenzioni e buone pratiche

- Nomi di file **senza spazi e senza accenti** (`cap-01.tex`, non
  `capitolo 1 àè.tex`): LaTeX e i tool correlati li digeriscono meglio.
- `main.tex` resta piccolo: solo impostazioni e `\input`;
- `.latex-editor/build` contiene il risultato della build **e viene
  ricreato**: non metterci dentro nulla di tuo, non versionarlo in git (i
  modelli includono già un `.gitignore` a questo scopo);
- l'editor modifica solo file dentro la cartella del progetto: spostamenti
  di massa falli con l'explorer e poi **↻ (Aggiorna)**.

---

## 9. Modelli inclusi

«Nuovo progetto da template» offre cinque modelli originali:

| Modello | Per | Contenuto tipico |
| --- | --- | --- |
| **Article** | articoli, dispense brevi | abstract, sezioni, equazioni, bibliografia |
| **Report** | relazioni tecniche | indice, capitoli, tabelle, bibliografia |
| **Book** | libri, manuali | frontespizio, capitoli, appendici |
| **Beamer** | presentazioni | frame pronti (richiede il pacchetto `beamer`, incluso nelle distribuzioni complete) |
| **Thesis** | tesi | capitoli, abstract, bibliografia (struttura da adattare alle norme del tuo ateneo) |

Ogni modello crea: `main.tex` pronto da compilare, un `.bib` di esempio, un
`.gitignore` e le impostazioni del progetto. Il repository include anche
l'esempio completo `examples/demo-article`.

---

## 10. Risoluzione dei problemi

| Problema | Soluzione |
| --- | --- |
| «Windows ha protetto il PC» (SmartScreen) | Normale: app non firmata. **Ulteriori informazioni → Esegui comunque** (o Proprietà → Sblocca). Vedi [2.3](#23-installazione-su-windows-unico-installer-msi) |
| «Distribuzione LaTeX non rilevata» (pallino rosso) | Installa MiKTeX/TeX Live/MacTeX e **riavvia l'editor** (li cerca nel PATH). Vedi [2.2](#22-prerequisito-una-distribuzione-latex) |
| «file principale non trovato: main.tex» | Il file indicato non esiste: apri Impostazioni → **File principale** e scrivi il nome giusto, oppure crea il file con «+ file» (il primo `.tex` creato viene adottato da solo) |
| Compilazione «con errori» | Clicca sulla riga rossa `file:linea` nel pannello output: salti al punto esatto; correggi e ricompila con F5 |
| Il PDF non si aggiorna | Controlla che l'ultima compilazione sia «terminata con successo»; verifica in Impostazioni il **File principale**; eventualmente «Ricarica» nell'anteprima |
| Il nuovo file creato è finito nella radice | I file si creano nella radice del progetto: organizza con cartelle + `\input`, sposta con l'explorer e poi **↻** |
| AppImage non si avvia | Installa FUSE oppure estrai: `./...AppImage --appimage-extract` |
| macOS: «non sviluppato da uno sviluppatore identificato» | Clic destro sull'app → **Apri** (una volta). Vedi [2.5](#25-installazione-su-macos) |
| MiKTeX scarica pacchetti durante la compilazione | È il comportamento «on-the-fly»: per restare offline imposta «Ask»/preinstalla i pacchetti necessari, o usa TeX Live completa |
| Beamer non compila | Installa il pacchetto `beamer` nella distribuzione |
| Non trovo i file di build | Sono in `<progetto>/.latex-editor/build` (PDF compreso); non modificarli a mano |
| L'app può leggere file fuori dal progetto? | No: ogni percorso è validato e confinato nella cartella del progetto aperto |

Se il problema persiste: nel repository, scheda *Issues* (serve un account
GitHub) — oppure confronta il comportamento con la
[checklist di collaudo](../README.md#checklist-di-collaudo-manuale) del
README.

---

## 11. Privacy, dati e backup

- **Rete**: nessuna. Nessun account, nessuna telemetria, nessun controllo
  di versione remota, nessun aggiornamento automatico.
- **File che l'app tocca**: solo dentro la cartella del progetto aperto
  (file tuoi + `.latex-editor/`) e la sua cartella dati utente (vedi
  [6](#6-impostazioni)) per le preferenze dell'app.
- **Backup di un progetto** = copiare la cartella (anche `.latex-editor/`,
  se vuoi portarti dietro le impostazioni). I `.tex` restano `.tex`.
- Le tue fonti non «vivono» dentro l'app: disinstallarla non cancella
  nulla dei progetti.

---

## 12. Aggiornamento e disinstallazione

- **Aggiornare**: scarica il nuovo installer dagli stessi link in [2.1](#21-download-degli-installatori)
  e installalo sopra la versione precedente (nessun aggiornamento
  automatico, per scelta progettuale: sei sempre tu a decidere).
- **Disinstallare**:
  - Windows: *Impostazioni → App → LaTeX Editor Offline → Disinstalla*;
  - Linux `.deb`: `sudo apt remove latex-editor-offline`;
  - Linux AppImage / macOS: cancella il file / l'app da *Applicazioni*.
- I progetti restano al loro posto sul disco in ogni caso.

---

*Manuale riferito alla versione 0.1.x dell'applicazione. Per lo sviluppo, le
scorciatoie del repository e le decisioni progettuali, vedi il
[README](../README.md).*
