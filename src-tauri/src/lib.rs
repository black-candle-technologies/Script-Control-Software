mod domain;

use domain::{AppInfo, PhaseStatus, SampleProject};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_sample_screenplay,
            get_sample_project,
            get_phase_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Script Control Software");
}
