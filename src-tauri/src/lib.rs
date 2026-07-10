mod domain;
mod fdx;
mod project_file;

use domain::{AppInfo, PhaseStatus, SampleProject};
use fdx::ScreenplayDocument;
use project_file::{ProjectManifest, ProjectType};
use std::path::Path;

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
            create_project_manifest
        ])
        .run(tauri::generate_context!())
        .expect("error while running Script Control Software");
}
