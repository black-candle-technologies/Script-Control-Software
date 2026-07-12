use crate::fdx::{now, ScreenplayDocument};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectType {
    FeatureFilm,
    Television,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScript {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub source_path: String,
    pub is_primary: bool,
    pub season_number: Option<u32>,
    pub episode_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub project_type: ProjectType,
    pub created_at: String,
    pub updated_at: String,
    pub scripts: Vec<ProjectScript>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBundle {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub project_type: ProjectType,
    pub created_at: String,
    pub updated_at: String,
    pub documents: Vec<Value>,
    pub versions: Vec<Value>,
}

pub fn save_bundle(
    path: &Path,
    name: String,
    project_type: ProjectType,
    documents: Vec<Value>,
    fountain_scripts: Vec<String>,
    versions: Vec<Value>,
) -> Result<ProjectBundle, String> {
    validate_path(path)?;
    if documents.is_empty() || documents.len() != fountain_scripts.len() {
        return Err("A project needs one Fountain script for every document.".into());
    }
    let root = path.parent().ok_or("Choose a project folder.")?;
    fs::create_dir_all(root.join("scripts"))
        .map_err(|error| format!("Project folders could not be created: {error}"))?;
    for folder in [
        "treatments",
        "notes",
        "references",
        "exports",
        ".scs/versions",
        ".scs/cache",
    ] {
        fs::create_dir_all(root.join(folder))
            .map_err(|error| format!("Project folders could not be created: {error}"))?;
    }
    for (index, script) in fountain_scripts.iter().enumerate() {
        let name = if fountain_scripts.len() == 1 {
            "main.fountain".into()
        } else {
            format!("episode-{}.fountain", index + 1)
        };
        fs::write(root.join("scripts").join(name), script)
            .map_err(|error| format!("A screenplay could not be saved: {error}"))?;
    }
    let existing = read_bundle(path).ok();
    let timestamp = crate::fdx::now();
    let bundle = ProjectBundle {
        schema_version: 2,
        id: existing
            .as_ref()
            .map(|bundle| bundle.id.clone())
            .unwrap_or_else(|| format!("project-{}", timestamp.replace([':', '-', '.'], ""))),
        name: name.trim().to_string(),
        project_type,
        created_at: existing
            .map(|bundle| bundle.created_at)
            .unwrap_or_else(|| timestamp.clone()),
        updated_at: timestamp,
        documents,
        versions,
    };
    let json = serde_json::to_string_pretty(&bundle)
        .map_err(|error| format!("Project could not be serialized: {error}"))?;
    atomic_write(path, format!("{json}\n").as_bytes())?;
    Ok(bundle)
}

pub fn read_bundle(path: &Path) -> Result<ProjectBundle, String> {
    validate_path(path)?;
    let bytes = fs::read(path).map_err(|error| format!("Project could not be opened: {error}"))?;
    let bundle: ProjectBundle = match serde_json::from_slice(&bytes) {
        Ok(bundle) => bundle,
        Err(bundle_error) => {
            let manifest: ProjectManifest = serde_json::from_slice(&bytes)
                .map_err(|_| format!("Project metadata is invalid: {bundle_error}"))?;
            let documents = manifest
                .scripts
                .iter()
                .map(|script| crate::fdx::parse_file(Path::new(&script.source_path)))
                .map(|result| {
                    result.and_then(|document| {
                        serde_json::to_value(document).map_err(|error| error.to_string())
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            ProjectBundle {
                schema_version: 1,
                id: manifest.id,
                name: manifest.name,
                project_type: manifest.project_type,
                created_at: manifest.created_at,
                updated_at: manifest.updated_at,
                documents,
                versions: Vec::new(),
            }
        }
    };
    if bundle.schema_version > 2 || bundle.documents.is_empty() {
        return Err("This project is empty or uses a newer SCS format.".into());
    }
    Ok(bundle)
}

fn validate_path(path: &Path) -> Result<(), String> {
    if path.file_name().and_then(|name| name.to_str()) != Some("scs.project.json") {
        return Err("SCS projects must be named scs.project.json.".into());
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Project could not be prepared: {error}"))?;
    if path.exists() {
        fs::rename(path, &backup)
            .map_err(|error| format!("Existing project could not be protected: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(format!("Project could not be saved: {error}"));
    }
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

pub fn create(
    path: &Path,
    name: String,
    project_type: ProjectType,
    documents: &[ScreenplayDocument],
) -> Result<ProjectManifest, String> {
    if documents.is_empty() {
        return Err("Import at least one FDX screenplay before creating a project.".into());
    }
    if path.file_name().and_then(|value| value.to_str()) != Some("scs.project.json") {
        return Err("SCS project manifests must be named scs.project.json.".into());
    }
    let timestamp = now();
    let scripts = documents
        .iter()
        .enumerate()
        .map(|(index, document)| ProjectScript {
            id: format!("script-{:04}", index + 1),
            title: document.title.clone(),
            source_type: "fdx".into(),
            source_path: document.source.path.clone(),
            is_primary: index == 0,
            season_number: (project_type == ProjectType::Television).then_some(1),
            episode_number: (project_type == ProjectType::Television).then_some(index as u32 + 1),
        })
        .collect();
    let manifest = ProjectManifest {
        schema_version: 1,
        id: format!("project-{}", timestamp.replace([':', '-', '.'], "")),
        name: name.trim().to_string(),
        project_type,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        scripts,
    };
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Project manifest could not be prepared: {error}"))?;
    std::fs::write(path, format!("{json}\n"))
        .map_err(|error| format!("Project manifest could not be saved: {error}"))?;
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fdx;

    #[test]
    fn television_manifest_numbers_linked_episode_scripts() {
        let bytes = include_bytes!("../test-fixtures/television-episode.fdx");
        let doc = fdx::parse(bytes, Path::new("pilot.fdx")).unwrap();
        let timestamp = now();
        let manifest = ProjectManifest {
            schema_version: 1,
            id: "project-test".into(),
            name: "Test Show".into(),
            project_type: ProjectType::Television,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            scripts: vec![ProjectScript {
                id: "script-0001".into(),
                title: doc.title,
                source_type: "fdx".into(),
                source_path: doc.source.path,
                is_primary: true,
                season_number: Some(1),
                episode_number: Some(1),
            }],
        };
        let json = serde_json::to_string(&manifest).unwrap();
        assert!(json.contains("\"projectType\":\"television\""));
        assert!(json.contains("\"episodeNumber\":1"));
    }

    #[test]
    fn project_bundle_round_trips_portable_documents_and_scripts() {
        let root = std::env::temp_dir().join(format!("scs-project-{}", std::process::id()));
        let path = root.join("scs.project.json");
        let document = serde_json::json!({"titlePage":{"title":"Test","author":""},"blocks":[],"sceneNotes":{}});
        let saved = save_bundle(
            &path,
            "Test".into(),
            ProjectType::FeatureFilm,
            vec![document.clone()],
            vec!["Title: Test\n".into()],
            Vec::new(),
        )
        .unwrap();
        assert_eq!(saved.documents[0], document);
        assert_eq!(read_bundle(&path).unwrap().name, "Test");
        assert_eq!(
            fs::read_to_string(root.join("scripts/main.fountain")).unwrap(),
            "Title: Test\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_linked_manifest_opens_as_a_bundle() {
        let root = std::env::temp_dir().join(format!("scs-legacy-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("scs.project.json");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("test-fixtures/minimal.fdx")
            .display()
            .to_string();
        let manifest = ProjectManifest {
            schema_version: 1,
            id: "legacy".into(),
            name: "Legacy".into(),
            project_type: ProjectType::FeatureFilm,
            created_at: now(),
            updated_at: now(),
            scripts: vec![ProjectScript {
                id: "script-1".into(),
                title: "Legacy".into(),
                source_type: "fdx".into(),
                source_path: fixture,
                is_primary: true,
                season_number: None,
                episode_number: None,
            }],
        };
        fs::write(&path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        let bundle = read_bundle(&path).unwrap();
        assert_eq!(bundle.schema_version, 1);
        assert_eq!(bundle.documents.len(), 1);
        let _ = fs::remove_dir_all(root);
    }
}
