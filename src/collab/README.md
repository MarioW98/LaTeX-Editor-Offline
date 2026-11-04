# `src/collab` — punti di estensione per la collaborazione (stub)

Questa cartella **non contiene alcuna implementazione**: il milestone 1 è
deliberatamente privo di collaborazione, come richiesto dalle specifiche
(niente account, server, rete o sincronizzazione).

Contiene solo le interfacce che un futuro provider dovrà rispettare:

- `CollaborationProvider` — ciclo di vita e stato della sessione
- `PresenceProvider` — utenti online e posizioni dei cursori
- `DocumentSyncProvider` — sincronizzazione di un buffer aperto
- `ProjectSyncProvider` — riconciliazione dell'albero del progetto

Vincoli di progettazione per chi implementerà questi punti di estensione:

1. nessun accesso diretto al layer Rust (`fs`/`build`): tutta la persistenza
   resta locale e basata su file;
2. i contenuti dei documenti passano sempre dallo store (unica fonte di
   verità), quindi un provider riceve e applica modifiche tramite store;
3. nessuna dipendenza runtime aggiuntiva finché la collaborazione non viene
   attivata esplicitamente dall'utente.
