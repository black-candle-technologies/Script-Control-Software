use crate::fdx::{now, ScreenplayDocument};
use serde::{Deserialize, Serialize};
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
}
