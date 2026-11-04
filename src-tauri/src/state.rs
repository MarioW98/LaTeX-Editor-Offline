use std::process::Child;
use std::sync::{Arc, Mutex};

use crate::commands::latex::LogLine;

/// Mutable state shared between commands and the build monitor thread.
#[derive(Default)]
pub struct AppState {
    /// The currently running build job, if any. Taken by `cancel_build`.
    pub build: Mutex<Option<BuildJob>>,
    /// Log of the most recent build (kept after the job ends).
    pub last_log: Mutex<Vec<LogLine>>,
    /// Outcome of the most recent build.
    pub last_success: Mutex<Option<bool>>,
}

pub struct BuildJob {
    pub child: Child,
    pub lines: Arc<Mutex<Vec<LogLine>>>,
}
