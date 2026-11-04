//! Template listing and project creation from a template.

use crate::error::AppResult;
use crate::templates::{self, TemplateInfo};

#[tauri::command]
pub fn list_templates() -> AppResult<Vec<TemplateInfo>> {
    Ok(templates::list())
}

/// Create a new project folder from an embedded template and return the
/// absolute path of the created project root.
#[tauri::command]
pub fn create_project_from_template(
    template_id: String,
    parent_dir: String,
    project_name: String,
) -> AppResult<String> {
    templates::create(&template_id, &parent_dir, &project_name)
}
