mod domain;

use domain::AppInfo;

/// Returns the application's identity so the frontend shell can render its
/// title bar and hero without hard-coding the version or phase.
#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo::current()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_app_info])
        .run(tauri::generate_context!())
        .expect("error while running Script Control Software");
}
