//! Managed Tauri state.

use crate::build_engine::BuildEngine;

pub struct AppState {
    pub build: BuildEngine,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            build: BuildEngine::new(),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
