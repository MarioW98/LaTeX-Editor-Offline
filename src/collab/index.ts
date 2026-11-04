/**
 * Registro (vuoto) dei provider di collaborazione.
 * In questa fase l'editor è completamente locale e offline: nessun provider
 * viene registrato. Le interfacce vivono in `types.ts` come extension point.
 */
export * from './types';

// Nessuna implementazione: vedi `types.ts` per i contratti futuri.
export const registeredProviders: [] = [];
