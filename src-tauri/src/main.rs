//! LaTeX Editor Offline — backend Tauri 2.
//!
//! Struttura:
//! - `commands/` — API invoke esposte al frontend (fs sandboxato, build, impostazioni);
//! - `fs/` — sandbox percorsi, albero file, scansione etichette;
//! - `latex/` — rilevamento strumenti e costruzione argomenti;
//! - `build/` — runner pipeline LaTeX e parser dei log;
//! - `state.rs` / `error.rs` — stato condiviso ed errori strutturati.
//!
//! Nessuna dipendenza da servizi remoti: tutto è locale e offline.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod build;
mod commands;
mod error;
mod fs;
mod latex;
mod state;
mod templates;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::project::open_project,
            commands::project::create_project,
            commands::project::read_file_tree,
            commands::project::collect_labels,
            commands::fs_cmds::read_file,
            commands::fs_cmds::write_file,
            commands::fs_cmds::create_entry,
            commands::fs_cmds::rename_entry,
            commands::fs_cmds::delete_entry,
            commands::fs_cmds::file_stat,
            commands::fs_cmds::read_pdf,
            commands::build_cmds::detect_latex,
            commands::build_cmds::start_build,
            commands::build_cmds::cancel_build,
            commands::settings::read_global_settings,
            commands::settings::write_global_settings,
            commands::settings::read_project_settings,
            commands::settings::write_project_settings,
        ])
        .run(tauri::generate_context!())
        .expect("impossibile avviare LaTeX Editor Offline");
}
