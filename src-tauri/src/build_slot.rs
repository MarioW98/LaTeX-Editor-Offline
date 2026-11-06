//! Identity slot for build jobs, extracted as pure logic (no processes, no
//! Tauri) so the interleavings can be unit-tested deterministically with
//! plain `cargo test`.
//!
//! Contract:
//! - `reserve` performs the check-and-claim in ONE serialized step: while a
//!   job id occupies the slot, every other `reserve` fails. This closes the
//!   pre-registration window in which two `start_build` calls could both
//!   pass the "already building" guard.
//! - `finish(id)` and `cancel_active()` touch the slot only for the job
//!   that actually occupies it: a late cleanup of an old job can never
//!   release the slot of a newer one (the naive end-of-build `*g = None`
//!   did exactly that, making a concurrently started build auto-cancel).
//! - `is_active(id)` is the cancellation signal polled by the monitor: the
//!   slot can legitimately have no child registered yet, so "no child" must
//!   not be confused with "cancelled".
//! - `poll_action` decides, at each monitor poll, what the polling monitor
//!   does — and the ONLY kill target it can ever order is the monitor's OWN
//!   child (a local variable of its thread). The naive code took whatever
//!   child sat in the shared `state.build` and killed it, whichever job
//!   owned it: the cancelled monitor of job A could kill the child of a
//!   job B started right after the cancellation.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

/// Error returned by `reserve` when a build is already running.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SlotBusy;

#[derive(Default)]
pub struct BuildSlot {
    /// Id of the job that currently owns the build, if any.
    active: Mutex<Option<u64>>,
    /// Monotonic job identity.
    counter: AtomicU64,
}

impl BuildSlot {
    /// Claim the slot synchronously and obtain a fresh job id. Fails with
    /// [`SlotBusy`] if a build is already running — there is no window in
    /// which two callers can both succeed.
    pub fn reserve(&self) -> Result<u64, SlotBusy> {
        let mut guard = self.active.lock().unwrap_or_else(|p| p.into_inner());
        if guard.is_some() {
            return Err(SlotBusy);
        }
        let id = self.counter.fetch_add(1, Ordering::Relaxed);
        *guard = Some(id);
        Ok(id)
    }

    /// True if `id` is the job that currently owns the build.
    pub fn is_active(&self, id: u64) -> bool {
        *self.active.lock().unwrap_or_else(|p| p.into_inner()) == Some(id)
    }

    /// End-of-job cleanup: releases the slot ONLY if it still contains
    /// `id`. Returns true if this call released it; a late or duplicated
    /// cleanup of an older job is a no-op.
    pub fn finish(&self, id: u64) -> bool {
        let mut guard = self.active.lock().unwrap_or_else(|p| p.into_inner());
        if *guard == Some(id) {
            *guard = None;
            true
        } else {
            false
        }
    }

    /// Cancel: releases whichever job is active and returns its id
    /// (`None` if nothing is running). A job reserved afterwards is never
    /// touched by this call.
    pub fn cancel_active(&self) -> Option<u64> {
        self.active.lock().unwrap_or_else(|p| p.into_inner()).take()
    }
}

/// State of the monitor's OWN child as observed by `try_wait` at a poll
/// iteration (pure representation: no process handle involved).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OwnChild {
    /// Still running.
    Running,
    /// Exited, with this overall success flag.
    Exited { success: bool },
    /// `try_wait` failed: the child state is lost, treat as failure.
    Lost,
}

/// What the monitor does at a poll iteration. The kill target, when there
/// is one, is ALWAYS the monitor's own child: no decision exists that
/// touches a child registered by another job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PollAction {
    /// The job still owns the slot and its child is running: keep polling.
    KeepWaiting,
    /// The job no longer owns the slot (cancelled): kill and reap the OWN
    /// child — a local variable of this monitor's thread. Killing a child
    /// that already exited is a harmless no-op, so this is safe even when
    /// the exit raced with the cancellation.
    CancelOwn,
    /// The own child exited (or was lost): finish the step with this
    /// outcome.
    Finish { success: bool },
}

/// Pure decision taken at every monitor poll, based ONLY on whether the
/// polling job still owns the slot and on the state of its OWN child.
/// The naive code instead took whatever child was registered in the
/// shared `state.build` and killed it, whichever job owned it.
pub fn poll_action(slot_active: bool, own_child: OwnChild) -> PollAction {
    if !slot_active {
        return PollAction::CancelOwn;
    }
    match own_child {
        OwnChild::Running => PollAction::KeepWaiting,
        OwnChild::Exited { success } => PollAction::Finish { success },
        OwnChild::Lost => PollAction::Finish { success: false },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    // (a) seconda reserve() con slot occupato → Err.
    #[test]
    fn second_reserve_while_busy_fails() {
        let slot = BuildSlot::default();
        let a = slot.reserve().expect("la prima reserve deve riuscire");
        assert_eq!(
            slot.reserve(),
            Err(SlotBusy),
            "una seconda reserve con lo slot occupato è passata"
        );
        assert!(slot.is_active(a), "il job originale non è più attivo");
        // e lo slot non è stato corrotto dalla reserve rifiutata
        assert!(
            slot.finish(a),
            "il job attivo deve poter rilasciare lo slot"
        );
    }

    // (b) finish() del job vecchio NON svuota lo slot se contiene il job
    // nuovo. Il naive (svuotamento incondizionato a fine build) lo svuotava
    // e il job nuovo si autocancellava.
    #[test]
    fn late_finish_of_old_job_does_not_release_new_job_slot() {
        let slot = BuildSlot::default();
        let old = slot.reserve().unwrap();
        assert!(
            slot.finish(old),
            "il job attivo rilascia lo slot normalmente"
        );
        let new = slot.reserve().unwrap();
        assert!(
            !slot.finish(old),
            "la pulizia tardiva del job vecchio non deve rilasciare lo slot"
        );
        assert!(
            slot.is_active(new),
            "il job nuovo è stato svuotato dalla pulizia del vecchio"
        );
        assert!(slot.finish(new), "solo il job nuovo può rilasciare lo slot");
    }

    // (b') il caso arbitrario: finish di un id mai riservato è un no-op.
    #[test]
    fn finish_of_unknown_id_is_a_noop() {
        let slot = BuildSlot::default();
        let a = slot.reserve().unwrap();
        assert!(!slot.finish(9999));
        assert!(slot.is_active(a));
        slot.finish(a).then_some(()).unwrap();
        assert!(!slot.finish(a), "doppio finish: il secondo è un no-op");
    }

    // (c) cancel tocca solo il job attivo.
    #[test]
    fn cancel_touches_only_the_active_job() {
        let slot = BuildSlot::default();
        let a = slot.reserve().unwrap();
        assert_eq!(
            slot.cancel_active(),
            Some(a),
            "cancel deve restituire il job attivo"
        );
        assert!(!slot.is_active(a));
        assert_eq!(
            slot.cancel_active(),
            None,
            "cancel su slot vuoto non deve toccare nulla"
        );
        // dopo la cancellazione, una pulizia in ritardo del vecchio job è un no-op
        assert!(!slot.finish(a));
        // un job riservato DOPO la cancellazione non viene toccato
        let b = slot.reserve().unwrap();
        assert!(slot.is_active(b));
        assert!(slot.finish(b));
        assert_eq!(slot.cancel_active(), None);
    }

    // (d) correntezza: su N reserve concorrenti su slot vuoto ne passa
    // esattamente una.
    #[test]
    fn concurrent_reserve_on_empty_slot_exactly_one_wins() {
        let slot = Arc::new(BuildSlot::default());
        let mut handles = Vec::new();
        for _ in 0..8 {
            let s = Arc::clone(&slot);
            handles.push(thread::spawn(move || s.reserve()));
        }
        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        let winners: Vec<u64> = results.into_iter().filter_map(|r| r.ok()).collect();
        assert_eq!(
            winners.len(),
            1,
            "esattamente una reserve concorrente deve riuscire, non {}",
            winners.len()
        );
        // gli id assegnati restano univoci anche per le reserve rifiutate
        let slot = BuildSlot::default();
        let a = slot.reserve().unwrap();
        slot.finish(a).then_some(()).unwrap();
        let b = slot.reserve().unwrap();
        assert_ne!(a, b, "gli id dei job devono essere univoci");
    }

    // (d') con lo slot occupato, nessuna reserve concorrente riesce.
    #[test]
    fn concurrent_reserve_on_busy_slot_all_fail() {
        let slot = Arc::new(BuildSlot::default());
        let active = slot.reserve().unwrap();
        let mut handles = Vec::new();
        for _ in 0..8 {
            let s = Arc::clone(&slot);
            handles.push(thread::spawn(move || s.reserve()));
        }
        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        assert!(
            results.iter().all(|r| *r == Err(SlotBusy)),
            "con lo slot occupato ogni reserve concorrente deve fallire"
        );
        assert!(
            slot.is_active(active),
            "il job attivo non deve essere toccato"
        );
    }

    // (e) B0.5 — scenario della race residua: job A attivo, l'utente
    // cancella, il job B riserva SUBITO dopo. La logica di polling del
    // monitor di A può ordinare l'uccisione del PROPRIO figlio soltanto:
    // non esiste decisione che tocchi il figlio che B (nel frattempo) ha
    // registrato nello stato condiviso.
    #[test]
    fn cancelled_monitor_kills_only_its_own_child_never_job_b() {
        let slot = BuildSlot::default();
        let a = slot.reserve().unwrap();
        // L'utente cancella (cancel_build svuota lo slot) e B riserva
        // subito dopo: è il momento in cui il vecchio codice prelevava da
        // state.build il figlio QUALUNQUE e lo uccide — quello di B.
        slot.cancel_active();
        let b = slot.reserve().unwrap();

        // Poll del monitor di A: la sua identità non è più attiva → può
        // ordinare SOLO l'uccisione del proprio figlio locale.
        let decision_a = poll_action(slot.is_active(a), OwnChild::Running);
        assert_eq!(
            decision_a,
            PollAction::CancelOwn,
            "il monitor cancellato deve poter uccidere solo il PROPRIO figlio, decisione: {decision_a:?}"
        );

        // La decisione di A non ha toccato nulla di B: B è ancora il
        // proprietario dello slot e il suo polling procede normalmente.
        assert!(!slot.is_active(a), "A non deve essere più attivo");
        assert!(slot.is_active(b), "B è stato toccato dalla cancellazione di A");
        assert_eq!(
            poll_action(slot.is_active(b), OwnChild::Running),
            PollAction::KeepWaiting,
            "il monitor di B deve continuare ad attendere il proprio figlio"
        );
        assert_eq!(
            poll_action(slot.is_active(b), OwnChild::Exited { success: true }),
            PollAction::Finish { success: true },
            "il monitor di B deve poter portare a termine il proprio passo"
        );
    }

    // (e') B0.5 — tabella completa della decisione di polling: la decisione
    // dipende SOLO dall'identità del job che fa il polling e dal proprio
    // figlio; il figlio uscito perde solo quando lo slot non è più suo.
    #[test]
    fn poll_action_table() {
        // Slot attivo: il figlio decide l'esito del passo.
        assert_eq!(poll_action(true, OwnChild::Running), PollAction::KeepWaiting);
        assert_eq!(
            poll_action(true, OwnChild::Exited { success: true }),
            PollAction::Finish { success: true }
        );
        assert_eq!(
            poll_action(true, OwnChild::Exited { success: false }),
            PollAction::Finish { success: false }
        );
        assert_eq!(
            poll_action(true, OwnChild::Lost),
            PollAction::Finish { success: false }
        );
        // Slot non più posseduto: si uccide e si ricava il PROPRIO figlio
        // (kill su un figlio già uscito = no-op innocuo), qualunque sia il
        // suo stato.
        assert_eq!(poll_action(false, OwnChild::Running), PollAction::CancelOwn);
        assert_eq!(poll_action(false, OwnChild::Exited { success: true }), PollAction::CancelOwn);
        assert_eq!(poll_action(false, OwnChild::Lost), PollAction::CancelOwn);
    }
}
