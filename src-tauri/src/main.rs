#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod atomic_io;
mod build_slot;
mod commands;
mod error;
mod state;
mod textfile;
mod toolchain;
mod trashbin;

use state::AppState;

fn main() {
    tauri::Builder::default()
        // MU.1 — updater opt-in: il plugin espone i comandi (check/download/
        // install/relaunch) ma NON fa nulla da solo: nessun controllo
        // automatico, né all'avvio né in background. L'unico accesso alla
        // rete dell'app parte dal click dell'utente su «Controlla
        // aggiornamenti». Il riavvio (plugin-process) serve solo a fine
        // installazione.
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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

#[cfg(test)]
mod updater_tests {
    use serde_json::Value;

    fn tauri_conf() -> Value {
        serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json deve restare JSON valido")
    }

    fn capabilities() -> Value {
        serde_json::from_str(include_str!("../capabilities/default.json"))
            .expect("capabilities/default.json deve restare JSON valido")
    }

    /// MU.1 — la configurazione dell'updater è quella decisa e deve restare
    /// tale: artifact firmati attivi, UN solo endpoint che punta al
    /// rilascio VERSIONATO (l'endpoint ufficiale releases/latest salta le
    /// prerelease, quindi gli update arrivano SOLO dai tag v*, mai dal
    /// rolling "latest" di main) e pubkey minisign del maintainer presente.
    /// Sul codice precedente alla correzione questo test falliva al primo
    /// assert: tauri.conf.json non aveva né createUpdaterArtifacts né la
    /// sezione plugins.updater.
    #[test]
    fn updater_config_is_exactly_the_decided_one() {
        let conf = tauri_conf();
        assert!(
            conf["bundle"]["createUpdaterArtifacts"].as_bool().unwrap_or(false),
            "bundle.createUpdaterArtifacts deve essere true: senza artifact firmati l'updater non può verificare nulla"
        );
        let endpoints: Vec<String> = conf["plugins"]["updater"]["endpoints"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        assert_eq!(
            endpoints.len(),
            1,
            "deve esserci esattamente UN endpoint updater, trovati: {endpoints:?}"
        );
        assert_eq!(
            endpoints[0],
            "https://github.com/MarioW98/LaTeX-Editor-Offline/releases/latest/download/latest.json",
            "l'endpoint deve puntare all'ultimo rilascio VERSIONATO (releases/latest salta le prerelease)"
        );
        let pubkey = conf["plugins"]["updater"]["pubkey"].as_str().unwrap_or("");
        assert!(
            !pubkey.is_empty(),
            "la pubkey minisign del maintainer non può mancare: senza chiave pubblica gli update non sono verificabili"
        );
    }

    /// MU.1 — permessi minimi per l'updater: updater:default e
    /// process:allow-restart, NIENTE di più.
    #[test]
    fn capabilities_are_updater_minimal() {
        let caps = capabilities();
        let names: Vec<&str> = caps["permissions"]
            .as_array()
            .map(|a| a.iter().filter_map(|p| p.as_str()).collect())
            .unwrap_or_default();
        assert!(
            names.contains(&"updater:default"),
            "manca il permesso updater:default (check/download/install)"
        );
        assert!(
            names.contains(&"process:allow-restart"),
            "manca il permesso process:allow-restart (riavvio post-installazione)"
        );
        let extra: Vec<&str> = names
            .iter()
            .copied()
            .filter(|p| {
                (p.starts_with("updater:") && *p != "updater:default")
                    || (p.starts_with("process:") && *p != "process:allow-restart")
            })
            .collect();
        assert!(
            extra.is_empty(),
            "permessi updater/process oltre ai minimi (vietato): {extra:?}"
        );
    }
}
