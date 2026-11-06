use std::process::Child;
use std::sync::{Arc, Mutex};

use crate::build_slot::BuildSlot;
use crate::commands::latex::LogLine;

/// Mutable state shared between commands and the build monitor thread.
#[derive(Default)]
pub struct AppState {
    /// Child process of the current step, registered by the monitor right
    /// after the spawn. Taken by `cancel_build` and by the monitor's
    /// cancellation path. Its presence is NOT the cancellation signal:
    /// between steps it legitimately holds the previous step's exited
    /// child, and before the first registration it is empty.
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

pub struct BuildJob {
    pub child: Child,
    pub lines: Arc<Mutex<Vec<LogLine>>>,
}
