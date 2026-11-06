#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod atomic_io;
mod commands;
mod error;
mod state;
mod textfile;
mod trashbin;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::project::select_project_folder,
            commands::project::read_file_tree,
            commands::project::read_file,
            commands::project::write_file,
            commands::project::create_item,
            commands::project::rename_item,
            commands::project::delete_item,
            commands::latex::detect_latex,
            commands::latex::start_build,
            commands::latex::cancel_build,
            commands::latex::read_build_log,
            commands::latex::read_pdf_bytes,
            commands::settings::get_project_settings,
            commands::settings::save_project_settings,
            commands::settings::get_app_settings,
            commands::settings::save_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
