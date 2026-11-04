//! Build commands: start, cancel, read output, locate the produced PDF.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::build_engine::BuildParams;
use crate::error::{AppError, AppResult};
use crate::latex;
use crate::sandbox;
use crate::settings;
use crate::state::AppState;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartBuildParams {
    pub project_root: String,
    pub main_file: String,
    pub engine: String,
    pub output_dir: String,
    pub use_latexmk: bool,
    pub shell_escape: bool,
}

/// Start a build. Returns the build id immediately; output is streamed via
/// the `build://output` event and completion via `build://finished`.
#[tauri::command]
pub fn start_build(app: AppHandle, params: StartBuildParams) -> AppResult<u64> {
    // --- validation ---------------------------------------------------
    if !["pdflatex", "xelatex", "lualatex"].contains(&params.engine.as_str()) {
        return Err(AppError::InvalidPath(format!(
            "Motore non riconosciuto: {}",
            params.engine
        )));
    }
    let root = sandbox::validate_root(&params.project_root)?;

    let main_rel = sandbox::sanitize_relative(&params.main_file)?;
    if !main_rel.to_lowercase().ends_with(".tex") {
        return Err(AppError::InvalidPath(format!(
            "Il file principale deve essere un file .tex: {main_rel}"
        )));
    }
    let main_abs = sandbox::resolve_relative(&root, &main_rel)?;
    if !main_abs.is_file() {
        return Err(AppError::NotFound(format!(
            "File principale non trovato: {main_rel}"
        )));
    }

    let output_dir_rel = if params.output_dir.trim().is_empty() {
        ".latex-editor/build".to_string()
    } else {
        sandbox::sanitize_relative(&params.output_dir)?
    };

    // --- resolve binaries ---------------------------------------------
    let global = settings::load_global(&app);
    let override_dir = global.latex_path_override.as_deref();

    let engine_path = latex::find_binary(&params.engine, override_dir).ok_or_else(|| {
        AppError::msg(format!(
            "Motore '{}' non trovato. Installa una distribuzione LaTeX (TeX Live, MiKTeX o TinyTeX) e riprova da Impostazioni.",
            params.engine
        ))
    })?;
    let latexmk_path = if params.use_latexmk {
        latex::find_binary("latexmk", override_dir)
    } else {
        None
    };

    let main_base = main_abs
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "main".into());

    let state = app.state::<AppState>();
    let id = state.build.start(
        app.clone(),
        BuildParams {
            project_root: root,
            main_file: main_rel,
            main_base,
            output_dir_rel,
            engine: params.engine,
            engine_path,
            use_latexmk: params.use_latexmk,
            latexmk_path,
            shell_escape: params.shell_escape,
            path_override: global.latex_path_override.clone(),
        },
    );
    Ok(id)
}

/// Cancel a running build (kills the current subprocess).
#[tauri::command]
pub fn cancel_build(app: AppHandle, build_id: u64) -> AppResult<()> {
    let state = app.state::<AppState>();
    state.build.cancel(build_id)
}

/// Read the full captured output of a (recent) build run.
#[tauri::command]
pub fn read_build_output(app: AppHandle, build_id: u64) -> AppResult<String> {
    let state = app.state::<AppState>();
    state
        .build
        .log_text(build_id)
        .ok_or_else(|| AppError::msg("Output non più disponibile per questa compilazione."))
}

/// Return the absolute path of the compiled PDF if it exists.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PdfPathResult {
    pub path: Option<String>,
}

#[tauri::command]
pub fn get_built_pdf_path(
    project_root: String,
    main_file: String,
    output_dir: String,
) -> AppResult<PdfPathResult> {
    let root = sandbox::validate_root(&project_root)?;
    let main_rel = sandbox::sanitize_relative(&main_file)?;
    let output_dir_rel = if output_dir.trim().is_empty() {
        ".latex-editor/build".to_string()
    } else {
        sandbox::sanitize_relative(&output_dir)?
    };
    let main_abs = sandbox::resolve_relative(&root, &main_rel)?;
    let base = main_abs
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "main".into());
    let pdf = root
        .join(output_dir_rel)
        .join(format!("{base}.pdf"));
    Ok(PdfPathResult {
        path: if pdf.is_file() {
            Some(pdf.to_string_lossy().into_owned())
        } else {
            None
        },
    })
}
