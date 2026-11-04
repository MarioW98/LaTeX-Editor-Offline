# src/collab

Modulo placeholder per la collaborazione in tempo reale, **volontariamente
non implementata** nella release offline (requisito: zero rete).

Il file `interfaces.ts` definisce 4 interfacce pure (Transport, Presence,
Sync, SessionProvider) che costituiscono i punti di estensione riservati.
Un'eventuale implementazione futura dovrà restare disattivata di default e
attivabile solo esplicitamente dall'utente.
