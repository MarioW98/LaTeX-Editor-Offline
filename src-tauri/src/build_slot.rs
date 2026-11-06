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
    pub fn new() -> Self {
        Self::default()
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    // (a) seconda reserve() con slot occupato → Err.
    #[test]
    fn second_reserve_while_busy_fails() {
        let slot = BuildSlot::new();
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
        let slot = BuildSlot::new();
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
        let slot = BuildSlot::new();
        let a = slot.reserve().unwrap();
        assert!(!slot.finish(9999));
        assert!(slot.is_active(a));
        slot.finish(a).then_some(()).unwrap();
        assert!(!slot.finish(a), "doppio finish: il secondo è un no-op");
    }

    // (c) cancel tocca solo il job attivo.
    #[test]
    fn cancel_touches_only_the_active_job() {
        let slot = BuildSlot::new();
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
        let slot = Arc::new(BuildSlot::new());
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
        let slot = BuildSlot::new();
        let a = slot.reserve().unwrap();
        slot.finish(a).then_some(()).unwrap();
        let b = slot.reserve().unwrap();
        assert_ne!(a, b, "gli id dei job devono essere univoci");
    }

    // (d') con lo slot occupato, nessuna reserve concorrente riesce.
    #[test]
    fn concurrent_reserve_on_busy_slot_all_fail() {
        let slot = Arc::new(BuildSlot::new());
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
}
