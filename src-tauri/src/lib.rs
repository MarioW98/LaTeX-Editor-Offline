//! LaTeX Editor Offline — application core (Rust side).
//!
//! Module layout:
//! - `commands`   : all Tauri commands exposed to the frontend
//! - `sandbox`    : path validation, everything stays inside the project folder
//! - `settings`   : global (app data dir) and per-project (`.latex-editor/`) settings
//! - `latex`      : detection of the local TeX distribution and binaries
//! - `build_engine`: asynchronous, cancellable build runner (latexmk or multi-pass pipeline)
//! - `log_parser` : heuristic LaTeX log parser producing clickable issues
//! - `templates`  : embedded original project templates
//! - `state`      : managed Tauri state (the build engine)
//! - `error`      : serializable application error type

mod build_engine;
mod commands;
mod error;
mod latex;
mod log_parser;
mod sandbox;
mod settings;
mod state;
mod templates;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            // project / file system
            commands::fs_commands::open_project,
            commands::fs_commands::read_file_tree,
            commands::fs_commands::read_file,
            commands::fs_commands::write_file,
            commands::fs_commands::create_entry,
            commands::fs_commands::rename_entry,
            commands::fs_commands::delete_entry,
            commands::fs_commands::stat_file,
            commands::fs_commands::read_pdf_bytes,
            // settings
            commands::settings_commands::get_global_settings,
            commands::settings_commands::save_global_settings,
            commands::settings_commands::get_project_settings,
            commands::settings_commands::save_project_settings,
            // latex toolchain
            commands::latex_commands::detect_latex_installation,
            // build
            commands::build_commands::start_build,
            commands::build_commands::cancel_build,
            commands::build_commands::read_build_output,
            commands::build_commands::get_built_pdf_path,
            // templates
            commands::template_commands::list_templates,
            commands::template_commands::create_project_from_template,
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione Tauri");
}
