use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FdxFileInfo {
    pub path: String,
    pub file_name: String,
    pub modified_at: u64,
    pub size: u64,
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_fdx_files(folder_path: String, recursive: bool) -> Result<Vec<FdxFileInfo>, String> {
    let root = canonical_folder(&folder_path)?;
    let mut folders = vec![root];
    let mut files = Vec::new();

    while let Some(folder) = folders.pop() {
        let entries = fs::read_dir(&folder)
            .map_err(|error| format!("Watch folder could not be read: {error}"))?;

        for entry in entries {
            let entry =
                entry.map_err(|error| format!("Watch folder entry could not be read: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Watch folder entry could not be inspected: {error}"))?;

            // Do not follow links: a watched tree must stay inside the folder the user chose.
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if recursive {
                    folders.push(entry.path());
                }
                continue;
            }
            if file_type.is_file() && is_fdx(&entry.path()) {
                files.push(file_info(entry.path())?);
            }
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

#[tauri::command]
pub fn open_fdx_in_external_editor(path: String) -> Result<(), String> {
    let path = canonical_fdx_file(&path)?;
    tauri_plugin_opener::open_path(&path, None::<&str>)
        .map_err(|error| format!("Final Draft file could not be opened: {error}"))
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let path = canonical_reveal_target(&path)?;
    tauri_plugin_opener::reveal_item_in_dir(&path)
        .map_err(|error| format!("The item could not be revealed: {error}"))
}

fn file_info(path: PathBuf) -> Result<FdxFileInfo, String> {
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Final Draft file could not be inspected: {error}"))?;
    let modified_at = metadata
        .modified()
        .map_err(|error| format!("Final Draft file timestamp could not be read: {error}"))?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(FdxFileInfo {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("screenplay.fdx")
            .to_string(),
        path: path.to_string_lossy().to_string(),
        modified_at,
        size: metadata.len(),
    })
}

fn canonical_folder(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Choose a folder to watch.".into());
    }
    let path = fs::canonicalize(path)
        .map_err(|error| format!("Watch folder could not be accessed: {error}"))?;
    if !path.is_dir() {
        return Err("Choose an existing folder to watch.".into());
    }
    Ok(path)
}

fn canonical_fdx_file(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() || !is_fdx(Path::new(path)) {
        return Err("Choose an existing Final Draft .fdx file.".into());
    }
    let path = fs::canonicalize(path)
        .map_err(|error| format!("Final Draft file could not be accessed: {error}"))?;
    if !path.is_file() || !is_fdx(&path) {
        return Err("Choose an existing Final Draft .fdx file.".into());
    }
    Ok(path)
}

fn canonical_reveal_target(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Choose a watch folder or Final Draft file.".into());
    }
    let path = fs::canonicalize(path)
        .map_err(|error| format!("The item could not be accessed: {error}"))?;
    if path.is_dir() || (path.is_file() && is_fdx(&path)) {
        Ok(path)
    } else {
        Err("Only watch folders and Final Draft .fdx files can be revealed.".into())
    }
}

fn is_fdx(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("fdx"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestFolder(PathBuf);

    impl TestFolder {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "script-control-external-files-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestFolder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lists_only_fdx_files_at_the_requested_depth() {
        let folder = TestFolder::new();
        fs::write(folder.0.join("pilot.FDX"), b"pilot").unwrap();
        fs::write(folder.0.join("notes.txt"), b"notes").unwrap();
        let season = folder.0.join("season-one");
        fs::create_dir(&season).unwrap();
        fs::write(season.join("episode-2.fdx"), b"episode").unwrap();

        let shallow = list_fdx_files(folder.0.to_string_lossy().into(), false).unwrap();
        assert_eq!(shallow.len(), 1);
        assert_eq!(shallow[0].file_name, "pilot.FDX");

        let recursive = list_fdx_files(folder.0.to_string_lossy().into(), true).unwrap();
        assert_eq!(recursive.len(), 2);
        assert!(recursive
            .iter()
            .any(|file| file.file_name == "episode-2.fdx"));
    }

    #[test]
    fn validates_watch_open_and_reveal_targets() {
        let folder = TestFolder::new();
        let fdx = folder.0.join("pilot.fdx");
        let text = folder.0.join("notes.txt");
        fs::write(&fdx, b"pilot").unwrap();
        fs::write(&text, b"notes").unwrap();

        assert!(canonical_folder("").is_err());
        assert!(canonical_folder(text.to_string_lossy().as_ref()).is_err());
        assert!(canonical_fdx_file(text.to_string_lossy().as_ref()).is_err());
        assert!(canonical_fdx_file(fdx.to_string_lossy().as_ref()).is_ok());
        assert!(canonical_reveal_target(folder.0.to_string_lossy().as_ref()).is_ok());
        assert!(canonical_reveal_target(fdx.to_string_lossy().as_ref()).is_ok());
        assert!(canonical_reveal_target(text.to_string_lossy().as_ref()).is_err());
    }
}
