//! Foundational domain types for the Rust side of SCS.
//!
//! Phase 0 only needs enough of a model to (a) tell the frontend who the
//! application is and (b) establish the vocabulary the parser, storage and
//! versioning layers will share later. No behaviour lives here yet.

use serde::{Deserialize, Serialize};

/// Lifecycle state of a foundation capability. Mirrors the `FoundationStatus`
/// union used by the TypeScript frontend so both sides speak the same language.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityStatus {
    /// Wired up and running today.
    Active,
    /// Modelled and documented, but no behaviour yet.
    Drafted,
    /// Named so the architecture leaves room for it.
    Planned,
}

/// The two kinds of project SCS is built around. Behaviour is defined in later
/// phases; this exists so the storage and command layers can branch on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectKind {
    Feature,
    Show,
}

/// Identity surfaced to the frontend shell via the `get_app_info` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub short_name: String,
    pub version: String,
    pub phase: String,
    pub tagline: String,
}

impl AppInfo {
    /// The current build's identity. `version` tracks the crate version so the
    /// UI never drifts from the actual build.
    pub fn current() -> Self {
        Self {
            name: "Script Control Software".to_string(),
            short_name: "SCS".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            phase: "Roadmap build".to_string(),
            tagline: "A local-first development environment for film and television writing."
                .to_string(),
        }
    }
}

/// Portable sample-project metadata, matching `ProjectMeta` on the TS side
/// (camelCase over the wire).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleProject {
    pub format_version: u32,
    pub kind: ProjectKind,
    pub title: String,
    pub created_at: String,
}

impl SampleProject {
    pub fn sample() -> Self {
        Self {
            format_version: 1,
            kind: ProjectKind::Feature,
            title: "The Long Way Home".to_string(),
            created_at: "2026-07-08T00:00:00Z".to_string(),
        }
    }
}

/// One capability line in the phase report.
#[derive(Debug, Clone, Serialize)]
pub struct Capability {
    pub id: String,
    pub status: CapabilityStatus,
    pub detail: String,
}

/// What this build of SCS actually does — kept honest and in one place.
#[derive(Debug, Clone, Serialize)]
pub struct PhaseStatus {
    pub phase: String,
    pub summary: String,
    pub capabilities: Vec<Capability>,
}

impl PhaseStatus {
    pub fn current() -> Self {
        let cap = |id: &str, status: CapabilityStatus, detail: &str| Capability {
            id: id.to_string(),
            status,
            detail: detail.to_string(),
        };
        Self {
            phase: AppInfo::current().phase,
            summary: "Local-first screenplay editing, portable projects, deterministic analysis, versions, television development, and production tools."
                .to_string(),
            capabilities: vec![
                cap("editor", CapabilityStatus::Active, "Block-based screenplay editor with element types and keyboard flow."),
                cap("fountain", CapabilityStatus::Active, "Fountain-inspired serialize/parse for source view and export."),
                cap("detection", CapabilityStatus::Active, "Scenes, characters and locations derived live from the script."),
                cap("persistence", CapabilityStatus::Active, "Portable project folders save documents, Fountain scripts, metadata, and history."),
                cap("versioning", CapabilityStatus::Active, "Persistent draft snapshots, restore, and scene-aware comparison."),
                cap("television", CapabilityStatus::Active, "Multiple imported FDX episodes switch in tabs with shared cast and locations."),
                cap("recognition", CapabilityStatus::Active, "Deterministic character, location, object, and production-category recognition."),
                cap("fdx", CapabilityStatus::Active, "Rust imports common FDX content; the editor exports valid, clean FDX XML."),
                cap("sqlite", CapabilityStatus::Planned, "Local project index."),
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_identifies_as_scs() {
        let info = AppInfo::current();
        assert_eq!(info.name, "Script Control Software");
        assert_eq!(info.short_name, "SCS");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn capability_status_serializes_lowercase() {
        let json = serde_json::to_string(&CapabilityStatus::Planned).unwrap();
        assert_eq!(json, "\"planned\"");
    }

    #[test]
    fn project_kind_round_trips_as_snake_case() {
        let kind: ProjectKind = serde_json::from_str("\"show\"").unwrap();
        assert_eq!(kind, ProjectKind::Show);
        assert_eq!(
            serde_json::to_string(&ProjectKind::Feature).unwrap(),
            "\"feature\""
        );
    }
}
