use std::sync::{Arc, Mutex};

use crate::build_slot::BuildSlot;
use crate::commands::latex::LogLine;

/// Mutable state shared between commands and the build monitor thread.
#[derive(Default)]
pub struct AppState {
    /// Running-log registration of the job that currently owns the build
    /// slot. LOG ROLE ONLY: the child process is owned LOCALLY by the
    /// monitor thread that spawned it — nobody but that thread can kill
    /// or reap it (the old design kept the child here and the
    /// cancellation paths took and killed whatever sat in this slot,
    /// whichever job owned it). `id` lets the end-of-build cleanup of an
    /// old job avoid wiping the registration of a newer one.
    pub build: Mutex<Option<BuildJob>>,
    /// Identity of the running build job. Reserved synchronously by
    /// `start_build` (check-and-claim in one step: no double-start
    /// window) and released only by the job that owns it, so a late
    /// cleanup can never wipe a newer job (see `build_slot::BuildSlot`).
    pub slot: BuildSlot,
    /// Log of the most recent build (kept after the job ends).
    pub last_log: Mutex<Vec<LogLine>>,
    /// Outcome of the most recent build.
    pub last_success: Mutex<Option<bool>>,
}

/// Running log of the current build job, read by `read_build_log` while
/// the build is in progress. `id` is the identity that reserved the slot:
/// only the owning job's cleanup clears the registration.
pub struct BuildJob {
    pub id: u64,
    pub lines: Arc<Mutex<Vec<LogLine>>>,
}
