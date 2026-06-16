//! Foundational domain types for the Rust side of SCS.
//!
//! Phase 0 only needs enough of a model to (a) tell the frontend who the
//! application is and (b) establish the vocabulary the parser, storage and
//! versioning layers will share later. No behaviour lives here yet.

use serde::{Deserialize, Serialize};

/// Lifecycle state of a foundation capability. Mirrors the `FoundationStatus`
/// union used by the TypeScript frontend so both sides speak the same language.
#[allow(dead_code)] // Forward-looking model; consumed by the storage layer in a later phase.
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
#[allow(dead_code)] // Forward-looking model; consumed by the storage layer in a later phase.
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
            phase: "Phase 0 — Foundation".to_string(),
            tagline:
                "A local-first development environment for film and television writing."
                    .to_string(),
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
        assert_eq!(serde_json::to_string(&ProjectKind::Feature).unwrap(), "\"feature\"");
    }
}
