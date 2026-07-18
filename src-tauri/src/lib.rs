mod domain;
mod external_files;
mod fdx;
mod project_file;

use domain::{AppInfo, PhaseStatus, SampleProject};
use external_files::{list_fdx_files, open_fdx_in_external_editor, reveal_in_file_manager};
use fdx::ScreenplayDocument;
use project_file::{ProjectBundle, ProjectManifest, ProjectType};
use serde_json::Value;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Returns the application's identity so the frontend shell can render its
/// title bar and hero without hard-coding the version or phase.
#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo::current()
}

/// The sample screenplay in Fountain-inspired plain text. The same file is
/// bundled into the frontend via Vite, so both sides share one source.
#[tauri::command]
fn get_sample_screenplay() -> &'static str {
    include_str!("../../samples/sample.fountain")
}

/// Sample project metadata matching the portable `scs.project.json` shape.
#[tauri::command]
fn get_sample_project() -> SampleProject {
    SampleProject::sample()
}

/// Honest report of what this build actually does.
#[tauri::command]
fn get_phase_status() -> PhaseStatus {
    PhaseStatus::current()
}

#[tauri::command]
fn parse_fdx(path: String) -> Result<ScreenplayDocument, String> {
    fdx::parse_file(Path::new(&path))
}

#[tauri::command(rename_all = "camelCase")]
fn create_project_manifest(
    path: String,
    name: String,
    project_type: ProjectType,
    documents: Vec<ScreenplayDocument>,
) -> Result<ProjectManifest, String> {
    project_file::create(Path::new(&path), name, project_type, &documents)
}

#[tauri::command(rename_all = "camelCase")]
#[allow(clippy::too_many_arguments)]
fn save_project_bundle(
    path: String,
    name: String,
    project_type: ProjectType,
    documents: Vec<Value>,
    fountain_scripts: Vec<String>,
    versions: Vec<Value>,
    version_history: Value,
    workspace: Value,
    expected_updated_at: Option<String>,
) -> Result<ProjectBundle, String> {
    project_file::save_bundle(
        Path::new(&path),
        name,
        project_type,
        documents,
        fountain_scripts,
        versions,
        version_history,
        workspace,
        expected_updated_at,
    )
}

#[tauri::command]
fn open_project_bundle(path: String) -> Result<ProjectBundle, String> {
    project_file::read_bundle(Path::new(&path))
}

#[tauri::command]
fn file_modified_at(path: String) -> Result<u64, String> {
    std::fs::metadata(Path::new(&path))
        .and_then(|metadata| metadata.modified())
        .and_then(|modified| {
            modified
                .duration_since(UNIX_EPOCH)
                .map_err(std::io::Error::other)
        })
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("Linked file could not be checked: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_sample_screenplay,
            get_sample_project,
            get_phase_status,
            parse_fdx,
            create_project_manifest,
            save_project_bundle,
            open_project_bundle,
            file_modified_at,
            list_fdx_files,
            open_fdx_in_external_editor,
            reveal_in_file_manager
        ])
        .run(tauri::generate_context!())
        .expect("error while running Script Control Software");
}
