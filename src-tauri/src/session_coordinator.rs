use crate::window_manager::WindowManagerState;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

const HISTORY_LIMIT: usize = 256;
const ACTION_CACHE_LIMIT: usize = 1024;
const WILDCARD_RESOURCE: &str = "*";
const SESSION_REVISION_EVENT: &str = "scs://session-revision";

static SAVE_INTENT_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct SessionCoordinatorState {
    inner: Mutex<CoordinatorInner>,
}

#[derive(Default)]
struct CoordinatorInner {
    projects: HashMap<String, CoordinatedProject>,
}

struct CoordinatedProject {
    session_id: String,
    revision: u64,
    session: Value,
    resource_revisions: HashMap<String, u64>,
    history: VecDeque<MutationHistory>,
    action_order: VecDeque<String>,
    action_results: HashMap<String, CachedActionResult>,
    save_state: SaveIntentState,
}

#[derive(Clone)]
struct MutationHistory {
    revision: u64,
    conflict_keys: Vec<String>,
}

#[derive(Clone)]
struct CachedActionResult {
    disposition: MutationDisposition,
    revision: u64,
}

#[derive(Default)]
struct SaveIntentState {
    in_flight: Option<OwnedSaveIntent>,
    queued: VecDeque<SaveIntent>,
    last_recovery_revision: Option<u64>,
    last_portable_revision: Option<u64>,
}

struct OwnedSaveIntent {
    intent: SaveIntent,
    owner_window_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionMutationEnvelope {
    pub protocol_version: u32,
    pub project_id: String,
    pub session_id: String,
    pub origin_window_id: String,
    pub actor_id: String,
    pub action_id: String,
    pub base_revision: u64,
    pub issued_at: String,
    pub payload: SessionMutation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum SessionMutation {
    SetProjectName {
        name: String,
    },
    SetProjectType {
        project_type: String,
    },
    SetPersistenceMetadata {
        project_path: String,
        updated_at: String,
    },
    InsertDocument {
        document: Value,
        after_document_id: Option<String>,
    },
    RemoveDocument {
        document_id: String,
        recovery_snapshot_id: String,
    },
    ReplaceDocument {
        document_id: String,
        document: Value,
    },
    InsertBlock {
        document_id: String,
        block: Value,
        before_block_id: Option<String>,
    },
    ReplaceBlock {
        document_id: String,
        block_id: String,
        block: Value,
        expected_fingerprint: Option<String>,
    },
    RemoveBlock {
        document_id: String,
        block_id: String,
        expected_fingerprint: Option<String>,
    },
    SetWorkspace {
        workspace: Value,
    },
    UpsertLayout {
        layout: Value,
    },
    DeleteLayout {
        layout_id: String,
    },
    SetVersionHistory {
        version_history: Value,
    },
    ReplaceSession {
        session: Value,
    },
    Batch {
        mutations: Vec<AtomicSessionMutation>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum AtomicSessionMutation {
    SetProjectName {
        name: String,
    },
    SetProjectType {
        project_type: String,
    },
    SetPersistenceMetadata {
        project_path: String,
        updated_at: String,
    },
    InsertDocument {
        document: Value,
        after_document_id: Option<String>,
    },
    RemoveDocument {
        document_id: String,
        recovery_snapshot_id: String,
    },
    ReplaceDocument {
        document_id: String,
        document: Value,
    },
    InsertBlock {
        document_id: String,
        block: Value,
        before_block_id: Option<String>,
    },
    ReplaceBlock {
        document_id: String,
        block_id: String,
        block: Value,
        expected_fingerprint: Option<String>,
    },
    RemoveBlock {
        document_id: String,
        block_id: String,
        expected_fingerprint: Option<String>,
    },
    SetWorkspace {
        workspace: Value,
    },
    UpsertLayout {
        layout: Value,
    },
    DeleteLayout {
        layout_id: String,
    },
    SetVersionHistory {
        version_history: Value,
    },
    ReplaceSession {
        session: Value,
    },
}

impl SessionMutation {
    fn atoms(&self) -> Result<Vec<AtomicSessionMutation>, String> {
        let atoms = match self {
            Self::SetProjectName { name } => {
                vec![AtomicSessionMutation::SetProjectName { name: name.clone() }]
            }
            Self::SetProjectType { project_type } => {
                vec![AtomicSessionMutation::SetProjectType {
                    project_type: project_type.clone(),
                }]
            }
            Self::SetPersistenceMetadata {
                project_path,
                updated_at,
            } => vec![AtomicSessionMutation::SetPersistenceMetadata {
                project_path: project_path.clone(),
                updated_at: updated_at.clone(),
            }],
            Self::InsertDocument {
                document,
                after_document_id,
            } => vec![AtomicSessionMutation::InsertDocument {
                document: document.clone(),
                after_document_id: after_document_id.clone(),
            }],
            Self::RemoveDocument {
                document_id,
                recovery_snapshot_id,
            } => vec![AtomicSessionMutation::RemoveDocument {
                document_id: document_id.clone(),
                recovery_snapshot_id: recovery_snapshot_id.clone(),
            }],
            Self::ReplaceDocument {
                document_id,
                document,
            } => vec![AtomicSessionMutation::ReplaceDocument {
                document_id: document_id.clone(),
                document: document.clone(),
            }],
            Self::InsertBlock {
                document_id,
                block,
                before_block_id,
            } => vec![AtomicSessionMutation::InsertBlock {
                document_id: document_id.clone(),
                block: block.clone(),
                before_block_id: before_block_id.clone(),
            }],
            Self::ReplaceBlock {
                document_id,
                block_id,
                block,
                expected_fingerprint,
            } => vec![AtomicSessionMutation::ReplaceBlock {
                document_id: document_id.clone(),
                block_id: block_id.clone(),
                block: block.clone(),
                expected_fingerprint: expected_fingerprint.clone(),
            }],
            Self::RemoveBlock {
                document_id,
                block_id,
                expected_fingerprint,
            } => vec![AtomicSessionMutation::RemoveBlock {
                document_id: document_id.clone(),
                block_id: block_id.clone(),
                expected_fingerprint: expected_fingerprint.clone(),
            }],
            Self::SetWorkspace { workspace } => vec![AtomicSessionMutation::SetWorkspace {
                workspace: workspace.clone(),
            }],
            Self::UpsertLayout { layout } => vec![AtomicSessionMutation::UpsertLayout {
                layout: layout.clone(),
            }],
            Self::DeleteLayout { layout_id } => vec![AtomicSessionMutation::DeleteLayout {
                layout_id: layout_id.clone(),
            }],
            Self::SetVersionHistory { version_history } => {
                vec![AtomicSessionMutation::SetVersionHistory {
                    version_history: version_history.clone(),
                }]
            }
            Self::ReplaceSession { session } => vec![AtomicSessionMutation::ReplaceSession {
                session: session.clone(),
            }],
            Self::Batch { mutations } => mutations.clone(),
        };
        if atoms.is_empty() {
            return Err("A mutation batch cannot be empty.".into());
        }
        if atoms.len() > 512 {
            return Err("A mutation batch cannot contain more than 512 operations.".into());
        }
        Ok(atoms)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MutationDisposition {
    Accepted,
    Reconciled,
    Duplicate,
    Rejected,
    Resync,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MutationRejectionReason {
    WrongProject,
    WrongSession,
    WrongOrigin,
    Permission,
    InvalidEnvelope,
    FutureRevision,
    HistoryGap,
    StaleConflict,
    InvalidMutation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorSnapshot {
    pub project_id: String,
    pub session_id: String,
    pub revision: u64,
    pub session: Value,
    pub resource_revisions: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedMutationEvent {
    pub envelope: SessionMutationEnvelope,
    pub new_revision: u64,
    pub conflict_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMutationResult {
    pub disposition: MutationDisposition,
    pub revision: u64,
    pub accepted: Option<AcceptedMutationEvent>,
    pub reason: Option<MutationRejectionReason>,
    pub message: Option<String>,
    pub snapshot: Option<CoordinatorSnapshot>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SaveKind {
    Recovery,
    Portable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveIntent {
    pub intent_id: String,
    pub project_id: String,
    pub session_id: String,
    pub revision: u64,
    pub kind: SaveKind,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SaveIntentDisposition {
    Start,
    Queued,
    AlreadyCovered,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveIntentResult {
    pub disposition: SaveIntentDisposition,
    pub intent: SaveIntent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveCompletionResult {
    pub next: Option<SaveIntent>,
    pub last_recovery_revision: Option<u64>,
    pub last_portable_revision: Option<u64>,
    pub dirty: bool,
}

impl SessionCoordinatorState {
    pub fn register(
        &self,
        session_id: String,
        session: Value,
    ) -> Result<CoordinatorSnapshot, String> {
        validate_identifier("session id", &session_id)?;
        let project_id = validate_session(&session)?;
        let mut inner = self.lock()?;
        if let Some(existing) = inner.projects.get(&project_id) {
            if existing.session_id != session_id {
                return Err(
                    "A different coordinated session is already active for this project.".into(),
                );
            }
            return Ok(existing.snapshot(&project_id));
        }
        let project = CoordinatedProject {
            session_id: session_id.clone(),
            revision: 0,
            session,
            resource_revisions: HashMap::new(),
            history: VecDeque::new(),
            action_order: VecDeque::new(),
            action_results: HashMap::new(),
            save_state: SaveIntentState::default(),
        };
        let snapshot = project.snapshot(&project_id);
        inner.projects.insert(project_id, project);
        Ok(snapshot)
    }

    pub fn snapshot(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> Result<CoordinatorSnapshot, String> {
        let inner = self.lock()?;
        let project = inner
            .projects
            .get(project_id)
            .ok_or("The coordinated project is not active.")?;
        if project.session_id != session_id {
            return Err("The session id does not match the active coordinated project.".into());
        }
        Ok(project.snapshot(project_id))
    }

    pub(crate) fn snapshot_for_project(
        &self,
        project_id: &str,
    ) -> Result<CoordinatorSnapshot, String> {
        let inner = self.lock()?;
        let project = inner
            .projects
            .get(project_id)
            .ok_or("The coordinated project is not active.")?;
        Ok(project.snapshot(project_id))
    }

    pub fn revision(&self, project_id: &str, session_id: &str) -> Result<u64, String> {
        Ok(self.snapshot(project_id, session_id)?.revision)
    }

    pub(crate) fn release_project(&self, project_id: &str) -> Result<bool, String> {
        Ok(self.lock()?.projects.remove(project_id).is_some())
    }

    pub fn submit(&self, envelope: SessionMutationEnvelope) -> SubmitMutationResult {
        let envelope_error = validate_envelope(&envelope);
        if let Err(message) = envelope_error {
            return bare_rejection(
                MutationDisposition::Rejected,
                MutationRejectionReason::InvalidEnvelope,
                message,
            );
        }
        let mut inner = match self.lock() {
            Ok(inner) => inner,
            Err(message) => {
                return bare_rejection(
                    MutationDisposition::Rejected,
                    MutationRejectionReason::InvalidMutation,
                    message,
                )
            }
        };
        let Some(project) = inner.projects.get_mut(&envelope.project_id) else {
            return bare_rejection(
                MutationDisposition::Rejected,
                MutationRejectionReason::WrongProject,
                "Mutation belongs to an inactive project.".into(),
            );
        };
        if project.session_id != envelope.session_id {
            return project.rejection(
                &envelope.project_id,
                MutationDisposition::Rejected,
                MutationRejectionReason::WrongSession,
                "Mutation belongs to another live session.",
            );
        }
        if authoritative_actor_id(&project.session) != Some(envelope.actor_id.as_str()) {
            return project.rejection(
                &envelope.project_id,
                MutationDisposition::Rejected,
                MutationRejectionReason::Permission,
                "Mutation actor does not match the authoritative local project identity.",
            );
        }
        if !actor_can_edit(&project.session, &envelope.actor_id) {
            return project.rejection(
                &envelope.project_id,
                MutationDisposition::Rejected,
                MutationRejectionReason::Permission,
                "Collaborator cannot edit this project.",
            );
        }
        if let Some(cached) = project.action_results.get(&envelope.action_id) {
            return SubmitMutationResult {
                disposition: MutationDisposition::Duplicate,
                revision: cached.revision,
                accepted: None,
                reason: None,
                message: Some(format!(
                    "Action was already processed as {:?}.",
                    cached.disposition
                )),
                snapshot: None,
            };
        }
        if envelope.base_revision > project.revision {
            return project.rejection(
                &envelope.project_id,
                MutationDisposition::Resync,
                MutationRejectionReason::FutureRevision,
                "The authoritative state is behind the mutation base; request a snapshot.",
            );
        }

        let atoms = match envelope.payload.atoms() {
            Ok(atoms) => atoms,
            Err(message) => {
                return project.rejection(
                    &envelope.project_id,
                    MutationDisposition::Rejected,
                    MutationRejectionReason::InvalidMutation,
                    &message,
                )
            }
        };
        let conflict_keys = conflict_keys(&atoms);
        let stale = envelope.base_revision < project.revision;
        if stale {
            let earliest_retained_base = project
                .history
                .front()
                .map_or(project.revision, |entry| entry.revision.saturating_sub(1));
            if envelope.base_revision < earliest_retained_base {
                return project.rejection(
                    &envelope.project_id,
                    MutationDisposition::Resync,
                    MutationRejectionReason::HistoryGap,
                    "Mutation is older than retained reconciliation history; request a snapshot.",
                );
            }
            let changed_keys: Vec<&str> = project
                .history
                .iter()
                .filter(|entry| entry.revision > envelope.base_revision)
                .flat_map(|entry| entry.conflict_keys.iter().map(String::as_str))
                .collect();
            if conflict_keys.iter().any(|requested| {
                changed_keys
                    .iter()
                    .any(|changed| resource_keys_conflict(requested, changed))
            }) {
                return project.rejection(
                    &envelope.project_id,
                    MutationDisposition::Rejected,
                    MutationRejectionReason::StaleConflict,
                    "The same project content changed in another window; request a snapshot.",
                );
            }
        }

        let mut next_session = project.session.clone();
        if let Err(message) = apply_atoms(&mut next_session, &envelope.project_id, &atoms) {
            return project.rejection(
                &envelope.project_id,
                MutationDisposition::Rejected,
                MutationRejectionReason::InvalidMutation,
                &message,
            );
        }

        project.revision += 1;
        project.session = next_session;
        let revision = project.revision;
        for key in &conflict_keys {
            project.resource_revisions.insert(key.clone(), revision);
        }
        project.history.push_back(MutationHistory {
            revision,
            conflict_keys: conflict_keys.clone(),
        });
        while project.history.len() > HISTORY_LIMIT {
            project.history.pop_front();
        }
        let disposition = if stale {
            MutationDisposition::Reconciled
        } else {
            MutationDisposition::Accepted
        };
        project.cache_action(envelope.action_id.clone(), disposition, revision);
        SubmitMutationResult {
            disposition,
            revision,
            accepted: Some(AcceptedMutationEvent {
                envelope,
                new_revision: revision,
                conflict_keys,
            }),
            reason: None,
            message: None,
            snapshot: None,
        }
    }

    pub fn request_save(
        &self,
        project_id: &str,
        session_id: &str,
        owner_window_id: &str,
        revision: u64,
        kind: SaveKind,
    ) -> Result<SaveIntentResult, String> {
        validate_identifier("save owner window id", owner_window_id)?;
        let mut inner = self.lock()?;
        let project = inner
            .projects
            .get_mut(project_id)
            .ok_or("The coordinated project is not active.")?;
        if project.session_id != session_id {
            return Err("The save belongs to another live session.".into());
        }
        if revision > project.revision {
            return Err("Cannot save a revision newer than authoritative state.".into());
        }
        let covered = match kind {
            SaveKind::Recovery => project.save_state.last_recovery_revision,
            SaveKind::Portable => project.save_state.last_portable_revision,
        };
        // Recovery writes are interchangeable for a covered revision. Portable
        // callbacks are not: an explicit Save As may target a different path,
        // so it must always run through the serialized queue.
        if kind == SaveKind::Recovery && covered.is_some_and(|saved| saved >= revision) {
            let intent = SaveIntent {
                intent_id: "already-covered".into(),
                project_id: project_id.into(),
                session_id: session_id.into(),
                revision,
                kind,
            };
            return Ok(SaveIntentResult {
                disposition: SaveIntentDisposition::AlreadyCovered,
                intent,
            });
        }
        let intent = SaveIntent {
            intent_id: collision_resistant_id("save", &SAVE_INTENT_COUNTER),
            project_id: project_id.into(),
            session_id: session_id.into(),
            revision,
            kind,
        };
        if project.save_state.in_flight.is_none() {
            project
                .save_state
                .queued
                .retain(|queued| queued.kind != kind || queued.revision > revision);
            project.save_state.in_flight = Some(OwnedSaveIntent {
                intent: intent.clone(),
                owner_window_id: owner_window_id.into(),
            });
            Ok(SaveIntentResult {
                disposition: SaveIntentDisposition::Start,
                intent,
            })
        } else {
            let queued = if let Some(position) = project
                .save_state
                .queued
                .iter()
                .position(|queued| queued.kind == kind)
            {
                if project.save_state.queued[position].revision < revision {
                    let stable_intent_id = project.save_state.queued[position].intent_id.clone();
                    let mut replacement = intent;
                    replacement.intent_id = stable_intent_id;
                    project.save_state.queued[position] = replacement;
                }
                project.save_state.queued[position].clone()
            } else {
                project.save_state.queued.push_back(intent.clone());
                intent
            };
            Ok(SaveIntentResult {
                disposition: SaveIntentDisposition::Queued,
                intent: queued,
            })
        }
    }

    pub fn complete_save(
        &self,
        project_id: &str,
        session_id: &str,
        owner_window_id: &str,
        intent_id: &str,
        success: bool,
    ) -> Result<SaveCompletionResult, String> {
        let mut inner = self.lock()?;
        let project = inner
            .projects
            .get_mut(project_id)
            .ok_or("The coordinated project is not active.")?;
        if project.session_id != session_id {
            return Err("The save completion belongs to another live session.".into());
        }
        let active = project
            .save_state
            .in_flight
            .as_ref()
            .ok_or("There is no coordinated save in flight.")?;
        if active.owner_window_id != owner_window_id {
            return Err("Only the in-flight save owner can complete it.".into());
        }
        if active.intent.intent_id != intent_id {
            return Err("The save completion id does not match the in-flight save.".into());
        }
        let completed = project
            .save_state
            .in_flight
            .take()
            .expect("validated in-flight save exists")
            .intent;
        if success {
            let target = match completed.kind {
                SaveKind::Recovery => &mut project.save_state.last_recovery_revision,
                SaveKind::Portable => &mut project.save_state.last_portable_revision,
            };
            *target = Some(target.unwrap_or(0).max(completed.revision));
        }
        let next = project.save_state.queued.pop_front();
        project.save_state.in_flight = next.clone().map(|intent| OwnedSaveIntent {
            intent,
            owner_window_id: owner_window_id.into(),
        });
        Ok(SaveCompletionResult {
            next,
            last_recovery_revision: project.save_state.last_recovery_revision,
            last_portable_revision: project.save_state.last_portable_revision,
            dirty: project
                .save_state
                .last_portable_revision
                .is_none_or(|saved| saved < project.revision),
        })
    }

    pub(crate) fn abandon_save_owner(
        &self,
        project_id: &str,
        owner_window_id: &str,
    ) -> Result<Option<SaveIntent>, String> {
        let mut inner = self.lock()?;
        let Some(project) = inner.projects.get_mut(project_id) else {
            return Ok(None);
        };
        let Some(active) = project.save_state.in_flight.as_ref() else {
            return Ok(None);
        };
        if active.owner_window_id != owner_window_id {
            return Ok(None);
        }
        let abandoned = project
            .save_state
            .in_flight
            .take()
            .expect("validated in-flight save exists")
            .intent;
        let retry = if let Some(position) = project
            .save_state
            .queued
            .iter()
            .position(|queued| queued.kind == abandoned.kind)
        {
            let queued = project
                .save_state
                .queued
                .remove(position)
                .expect("validated queued save position exists");
            if queued.revision >= abandoned.revision {
                queued
            } else {
                abandoned.clone()
            }
        } else {
            abandoned.clone()
        };
        project.save_state.queued.push_front(retry);
        Ok(Some(abandoned))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, CoordinatorInner>, String> {
        self.inner
            .lock()
            .map_err(|_| "The session coordinator lock is poisoned.".into())
    }
}

impl CoordinatedProject {
    fn snapshot(&self, project_id: &str) -> CoordinatorSnapshot {
        CoordinatorSnapshot {
            project_id: project_id.into(),
            session_id: self.session_id.clone(),
            revision: self.revision,
            session: self.session.clone(),
            resource_revisions: self.resource_revisions.clone(),
        }
    }

    fn rejection(
        &self,
        project_id: &str,
        disposition: MutationDisposition,
        reason: MutationRejectionReason,
        message: &str,
    ) -> SubmitMutationResult {
        SubmitMutationResult {
            disposition,
            revision: self.revision,
            accepted: None,
            reason: Some(reason),
            message: Some(message.into()),
            snapshot: Some(self.snapshot(project_id)),
        }
    }

    fn cache_action(&mut self, action_id: String, disposition: MutationDisposition, revision: u64) {
        self.action_order.push_back(action_id.clone());
        self.action_results.insert(
            action_id,
            CachedActionResult {
                disposition,
                revision,
            },
        );
        while self.action_order.len() > ACTION_CACHE_LIMIT {
            if let Some(expired) = self.action_order.pop_front() {
                self.action_results.remove(&expired);
            }
        }
    }
}

fn bare_rejection(
    disposition: MutationDisposition,
    reason: MutationRejectionReason,
    message: String,
) -> SubmitMutationResult {
    SubmitMutationResult {
        disposition,
        revision: 0,
        accepted: None,
        reason: Some(reason),
        message: Some(message),
        snapshot: None,
    }
}

fn validate_envelope(envelope: &SessionMutationEnvelope) -> Result<(), String> {
    if envelope.protocol_version != 1 {
        return Err("Mutation protocol version is unsupported.".into());
    }
    validate_identifier("project id", &envelope.project_id)?;
    validate_identifier("session id", &envelope.session_id)?;
    validate_identifier("origin window id", &envelope.origin_window_id)?;
    validate_actor_id(&envelope.actor_id)?;
    validate_identifier("action id", &envelope.action_id)?;
    if envelope.issued_at.trim().is_empty() || envelope.issued_at.len() > 128 {
        return Err("Mutation timestamp is invalid.".into());
    }
    Ok(())
}

fn validate_actor_id(actor_id: &str) -> Result<(), String> {
    if actor_id.trim().is_empty() || actor_id.len() > 256 || actor_id.chars().any(char::is_control)
    {
        return Err("The mutation actor id is invalid.".into());
    }
    Ok(())
}

fn actor_can_edit(session: &Value, actor_id: &str) -> bool {
    const EDIT_ROLES: &[&str] = &[
        "owner",
        "writer",
        "co-writer",
        "story-editor",
        "script-coordinator",
    ];
    session
        .get("workspace")
        .and_then(|workspace| workspace.get("collaborators"))
        .and_then(Value::as_array)
        .and_then(|collaborators| {
            collaborators.iter().find(|collaborator| {
                collaborator.get("id").and_then(Value::as_str) == Some(actor_id)
            })
        })
        .and_then(|collaborator| collaborator.get("role"))
        .and_then(Value::as_str)
        .is_some_and(|role| EDIT_ROLES.contains(&role))
}

fn authoritative_actor_id(session: &Value) -> Option<&str> {
    session
        .get("workspace")
        .and_then(|workspace| workspace.get("currentUserId"))
        .and_then(Value::as_str)
        .filter(|actor_id| !actor_id.is_empty())
}

fn validate_identifier(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 180
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_:/.".contains(character))
    {
        return Err(format!("The {label} is invalid."));
    }
    Ok(())
}

fn validate_session(session: &Value) -> Result<String, String> {
    let object = session
        .as_object()
        .ok_or("Coordinated session must be a JSON object.")?;
    let project_id = required_string(object, "projectId", "Project id is missing.")?;
    validate_identifier("project id", project_id)?;
    if !object.get("name").is_some_and(Value::is_string) {
        return Err("Project name is missing.".into());
    }
    let documents = object
        .get("documents")
        .and_then(Value::as_array)
        .filter(|documents| !documents.is_empty())
        .ok_or("Coordinated session must contain at least one document.")?;
    let mut document_ids = std::collections::HashSet::new();
    for document in documents {
        validate_document(document, &mut document_ids)?;
    }
    if !object.get("workspace").is_some_and(Value::is_object) {
        return Err("Project workspace is missing or malformed.".into());
    }
    if !object.get("versionHistory").is_some_and(Value::is_object) {
        return Err("Project version history is missing or malformed.".into());
    }
    Ok(project_id.into())
}

fn validate_document(
    document: &Value,
    document_ids: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let object = document
        .as_object()
        .ok_or("A screenplay document is malformed.")?;
    let id = required_string(object, "id", "A screenplay document id is missing.")?;
    validate_identifier("document id", id)?;
    if !document_ids.insert(id.into()) {
        return Err(format!("Screenplay document id {id} is duplicated."));
    }
    let blocks = object
        .get("blocks")
        .and_then(Value::as_array)
        .ok_or("Screenplay blocks are missing.")?;
    let mut block_ids = std::collections::HashSet::new();
    for block in blocks {
        validate_block(block, &mut block_ids)?;
    }
    Ok(())
}

fn validate_block(
    block: &Value,
    block_ids: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let object = block
        .as_object()
        .ok_or("A screenplay block is malformed.")?;
    let id = required_string(object, "id", "A screenplay block id is missing.")?;
    validate_identifier("block id", id)?;
    if !block_ids.insert(id.into()) {
        return Err(format!("Screenplay block id {id} is duplicated."));
    }
    if !object.get("type").is_some_and(Value::is_string)
        || !object.get("text").is_some_and(Value::is_string)
    {
        return Err(format!("Screenplay block {id} is missing type or text."));
    }
    Ok(())
}

fn required_string<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    message: &str,
) -> Result<&'a str, String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| message.into())
}

fn conflict_keys(atoms: &[AtomicSessionMutation]) -> Vec<String> {
    let mut keys = Vec::new();
    for atom in atoms {
        let mut next = match atom {
            AtomicSessionMutation::SetProjectName { .. } => vec!["project:name".into()],
            AtomicSessionMutation::SetProjectType { .. } => vec!["project:type".into()],
            AtomicSessionMutation::SetPersistenceMetadata { .. } => {
                vec!["project:persistence".into()]
            }
            AtomicSessionMutation::InsertDocument { document, .. } => vec![
                "documents:order".into(),
                format!("document:{}", value_id(document).unwrap_or_default()),
            ],
            AtomicSessionMutation::RemoveDocument { document_id, .. } => {
                vec![
                    "documents:order".into(),
                    format!("document:{document_id}"),
                    "project:active-document".into(),
                    "versions".into(),
                    "workspace".into(),
                ]
            }
            AtomicSessionMutation::ReplaceDocument { document_id, .. } => {
                vec![format!("document:{document_id}")]
            }
            AtomicSessionMutation::InsertBlock {
                document_id, block, ..
            } => vec![
                format!("document:{document_id}:blocks:order"),
                format!(
                    "block:{document_id}:{}",
                    value_id(block).unwrap_or_default()
                ),
            ],
            AtomicSessionMutation::ReplaceBlock {
                document_id,
                block_id,
                ..
            } => vec![format!("block:{document_id}:{block_id}")],
            AtomicSessionMutation::RemoveBlock {
                document_id,
                block_id,
                ..
            } => vec![
                format!("document:{document_id}:blocks:order"),
                format!("block:{document_id}:{block_id}"),
            ],
            AtomicSessionMutation::SetWorkspace { .. } => vec!["workspace".into()],
            AtomicSessionMutation::UpsertLayout { layout } => {
                vec![format!("layout:{}", value_id(layout).unwrap_or_default())]
            }
            AtomicSessionMutation::DeleteLayout { layout_id } => {
                vec![format!("layout:{layout_id}")]
            }
            AtomicSessionMutation::SetVersionHistory { .. } => {
                vec!["version-history".into()]
            }
            AtomicSessionMutation::ReplaceSession { .. } => vec![WILDCARD_RESOURCE.into()],
        };
        keys.append(&mut next);
    }
    keys.sort();
    keys.dedup();
    keys
}

fn resource_keys_conflict(left: &str, right: &str) -> bool {
    if left == WILDCARD_RESOURCE || right == WILDCARD_RESOURCE || left == right {
        return true;
    }
    if left == "workspace" && right.starts_with("layout:") {
        return true;
    }
    if left.starts_with("layout:") && right == "workspace" {
        return false;
    }
    match (document_scope(left), document_scope(right)) {
        (Some(left_document), Some(right_document)) if left_document == right_document => {
            left.starts_with("document:") && !left.contains(":blocks:")
                || right.starts_with("document:") && !right.contains(":blocks:")
        }
        _ => false,
    }
}

fn document_scope(value: &str) -> Option<&str> {
    value
        .strip_prefix("document:")
        .and_then(|rest| rest.split(':').next())
        .or_else(|| {
            value
                .strip_prefix("block:")
                .and_then(|rest| rest.split(':').next())
        })
}

fn apply_atoms(
    session: &mut Value,
    project_id: &str,
    atoms: &[AtomicSessionMutation],
) -> Result<(), String> {
    for atom in atoms {
        apply_atom(session, project_id, atom)?;
    }
    let actual_project_id = validate_session(session)?;
    if actual_project_id != project_id {
        return Err("Mutation changed the coordinated project id.".into());
    }
    Ok(())
}

fn apply_atom(
    session: &mut Value,
    project_id: &str,
    atom: &AtomicSessionMutation,
) -> Result<(), String> {
    match atom {
        AtomicSessionMutation::SetProjectName { name } => {
            let name = name.trim();
            if name.is_empty() || name.len() > 512 {
                return Err("Project name is empty or too long.".into());
            }
            session_object_mut(session)?.insert("name".into(), Value::String(name.into()));
        }
        AtomicSessionMutation::SetProjectType { project_type } => {
            if project_type != "featureFilm" && project_type != "television" {
                return Err("Project type is invalid.".into());
            }
            session_object_mut(session)?
                .insert("projectType".into(), Value::String(project_type.clone()));
        }
        AtomicSessionMutation::SetPersistenceMetadata {
            project_path,
            updated_at,
        } => {
            if project_path.len() > 32_768 || project_path.contains('\0') {
                return Err("Project path metadata is invalid.".into());
            }
            if updated_at.trim().is_empty()
                || updated_at.len() > 128
                || updated_at.chars().any(char::is_control)
            {
                return Err("Project update token is invalid.".into());
            }
            let object = session_object_mut(session)?;
            object.insert("projectPath".into(), Value::String(project_path.clone()));
            object.insert("updatedAt".into(), Value::String(updated_at.clone()));
        }
        AtomicSessionMutation::InsertDocument {
            document,
            after_document_id,
        } => {
            let document_id = value_id(document)?;
            validate_identifier("document id", document_id)?;
            let documents = documents_mut(session)?;
            if documents
                .iter()
                .any(|candidate| value_id(candidate).ok() == Some(document_id))
            {
                return Err("Document id already exists.".into());
            }
            let index = match after_document_id {
                Some(anchor) => {
                    documents
                        .iter()
                        .position(|candidate| value_id(candidate).ok() == Some(anchor.as_str()))
                        .ok_or("Document insertion anchor no longer exists.")?
                        + 1
                }
                None => documents.len(),
            };
            documents.insert(index, document.clone());
        }
        AtomicSessionMutation::RemoveDocument {
            document_id,
            recovery_snapshot_id,
        } => remove_document(session, document_id, recovery_snapshot_id)?,
        AtomicSessionMutation::ReplaceDocument {
            document_id,
            document,
        } => {
            if value_id(document)? != document_id {
                return Err("Replacement document id does not match its target.".into());
            }
            let documents = documents_mut(session)?;
            let index = document_index(documents, document_id)?;
            documents[index] = document.clone();
        }
        AtomicSessionMutation::InsertBlock {
            document_id,
            block,
            before_block_id,
        } => {
            let block_id = value_id(block)?;
            validate_identifier("block id", block_id)?;
            let blocks = blocks_mut(session, document_id)?;
            if blocks
                .iter()
                .any(|candidate| value_id(candidate).ok() == Some(block_id))
            {
                return Err("Block id already exists.".into());
            }
            let index = match before_block_id {
                Some(anchor) => blocks
                    .iter()
                    .position(|candidate| value_id(candidate).ok() == Some(anchor.as_str()))
                    .ok_or("Block insertion anchor no longer exists.")?,
                None => blocks.len(),
            };
            blocks.insert(index, block.clone());
        }
        AtomicSessionMutation::ReplaceBlock {
            document_id,
            block_id,
            block,
            expected_fingerprint,
        } => {
            if value_id(block)? != block_id {
                return Err("Replacement block id does not match its target.".into());
            }
            let blocks = blocks_mut(session, document_id)?;
            let index = block_index(blocks, block_id)?;
            validate_expected_fingerprint(&blocks[index], expected_fingerprint.as_deref())?;
            blocks[index] = block.clone();
        }
        AtomicSessionMutation::RemoveBlock {
            document_id,
            block_id,
            expected_fingerprint,
        } => {
            let blocks = blocks_mut(session, document_id)?;
            let index = block_index(blocks, block_id)?;
            validate_expected_fingerprint(&blocks[index], expected_fingerprint.as_deref())?;
            blocks.remove(index);
        }
        AtomicSessionMutation::SetWorkspace { workspace } => {
            if !workspace.is_object() {
                return Err("Project workspace must be an object.".into());
            }
            session_object_mut(session)?.insert("workspace".into(), workspace.clone());
        }
        AtomicSessionMutation::UpsertLayout { layout } => upsert_layout(session, layout)?,
        AtomicSessionMutation::DeleteLayout { layout_id } => {
            delete_layout(session, layout_id)?;
        }
        AtomicSessionMutation::SetVersionHistory { version_history } => {
            if !version_history.is_object() {
                return Err("Version history must be an object.".into());
            }
            session_object_mut(session)?.insert("versionHistory".into(), version_history.clone());
        }
        AtomicSessionMutation::ReplaceSession {
            session: replacement,
        } => {
            if replacement.get("projectId").and_then(Value::as_str) != Some(project_id) {
                return Err("Replacement session belongs to another project.".into());
            }
            validate_session(replacement)?;
            *session = replacement.clone();
        }
    }
    Ok(())
}

fn remove_document(
    session: &mut Value,
    document_id: &str,
    recovery_snapshot_id: &str,
) -> Result<(), String> {
    validate_identifier("document id", document_id)?;
    validate_identifier("recovery snapshot id", recovery_snapshot_id)?;
    let recovery_contains_document = session
        .get("versionHistory")
        .and_then(|history| history.get("snapshots"))
        .and_then(Value::as_array)
        .is_some_and(|snapshots| {
            snapshots.iter().any(|snapshot| {
                snapshot.get("id").and_then(Value::as_str) == Some(recovery_snapshot_id)
                    && snapshot
                        .get("session")
                        .and_then(|saved| saved.get("documents"))
                        .and_then(Value::as_array)
                        .is_some_and(|documents| {
                            documents.iter().any(|document| {
                                document.get("id").and_then(Value::as_str) == Some(document_id)
                            })
                        })
            })
        });
    if !recovery_contains_document {
        return Err(
            "Document removal requires a project snapshot containing that screenplay.".into(),
        );
    }

    let next_active_document = {
        let documents = documents_mut(session)?;
        if documents.len() <= 1 {
            return Err("A project must retain at least one screenplay.".into());
        }
        let index = document_index(documents, document_id)?;
        documents.remove(index);
        value_id(&documents[0])?.to_string()
    };

    let object = session_object_mut(session)?;
    if let Some(versions) = object.get_mut("versions").and_then(Value::as_array_mut) {
        versions.retain(|version| {
            version
                .get("document")
                .and_then(|document| document.get("id"))
                .and_then(Value::as_str)
                != Some(document_id)
        });
    }
    if object.get("activeDocumentId").and_then(Value::as_str) == Some(document_id) {
        object.insert(
            "activeDocumentId".into(),
            Value::String(next_active_document),
        );
    }

    let workspace = object
        .get_mut("workspace")
        .and_then(Value::as_object_mut)
        .ok_or("Project workspace is malformed.")?;
    if let Some(reviews) = workspace.get_mut("reviews").and_then(Value::as_array_mut) {
        reviews.retain(|review| {
            review.get("documentId").and_then(Value::as_str) != Some(document_id)
                && !(review.get("targetType").and_then(Value::as_str) == Some("episode")
                    && review.get("targetId").and_then(Value::as_str) == Some(document_id))
        });
    }
    if let Some(writer_room) = workspace
        .get_mut("writerRoom")
        .and_then(Value::as_object_mut)
    {
        if let Some(tasks) = writer_room.get_mut("tasks").and_then(Value::as_array_mut) {
            tasks
                .retain(|task| task.get("documentId").and_then(Value::as_str) != Some(document_id));
        }
        if writer_room.get("activeDocumentId").and_then(Value::as_str) == Some(document_id) {
            writer_room.remove("activeDocumentId");
            writer_room.remove("activeSceneId");
        }
    }
    if let Some(series) = workspace.get_mut("series").and_then(Value::as_object_mut) {
        if let Some(continuity) = series.get_mut("continuity").and_then(Value::as_array_mut) {
            for item in continuity {
                if let Some(episode_ids) = item.get_mut("episodeIds").and_then(Value::as_array_mut)
                {
                    episode_ids.retain(|id| id.as_str() != Some(document_id));
                }
            }
        }
        if let Some(episodes) = series.get_mut("episodes").and_then(Value::as_object_mut) {
            episodes.remove(document_id);
        }
        if let Some(seasons) = series.get_mut("seasons").and_then(Value::as_array_mut) {
            for season in seasons {
                if let Some(episode_ids) =
                    season.get_mut("episodeIds").and_then(Value::as_array_mut)
                {
                    episode_ids.retain(|id| id.as_str() != Some(document_id));
                }
            }
        }
    }
    Ok(())
}

const BUILTIN_LAYOUT_IDS: &[&str] = &[
    "writer",
    "development",
    "revision",
    "television",
    "production",
    "companion",
];

fn validate_custom_layout(layout: &Value) -> Result<&str, String> {
    let object = layout
        .as_object()
        .ok_or("Custom workspace layout must be an object.")?;
    let id = required_string(object, "id", "Custom workspace layout id is missing.")?;
    if id.len() > 180
        || !id
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
    {
        return Err("Custom workspace layout id is invalid.".into());
    }
    if BUILTIN_LAYOUT_IDS.contains(&id) {
        return Err("Built-in workspace layouts cannot be overwritten.".into());
    }
    if object
        .get("name")
        .and_then(Value::as_str)
        .is_none_or(|name| name.trim().is_empty())
    {
        return Err("Custom workspace layout name is required.".into());
    }
    for field in ["panels", "floatingPanels", "synchronizedPanels"] {
        if !object.get(field).is_some_and(Value::is_array) {
            return Err(format!("Custom workspace layout {field} is malformed."));
        }
    }
    let legacy_topology = object.get("tabGroups").is_some_and(Value::is_array)
        && object.get("splits").is_some_and(Value::is_array);
    let dock_tree_topology = object.get("layoutVersion").and_then(Value::as_u64) == Some(2)
        && object.get("root").is_some_and(Value::is_object)
        && object.get("hiddenPanelIds").is_some_and(Value::is_array);
    if !legacy_topology && !dock_tree_topology {
        return Err("Custom workspace layout topology is malformed.".into());
    }
    Ok(id)
}

fn upsert_layout(session: &mut Value, layout: &Value) -> Result<(), String> {
    let layout_id = validate_custom_layout(layout)?.to_string();
    let workspace = session_object_mut(session)?
        .get_mut("workspace")
        .and_then(Value::as_object_mut)
        .ok_or("Project workspace is malformed.")?;
    let layouts = workspace
        .get_mut("layouts")
        .and_then(Value::as_array_mut)
        .ok_or("Project workspace layouts are malformed.")?;
    if let Some(index) = layouts
        .iter()
        .position(|candidate| candidate.get("id").and_then(Value::as_str) == Some(&layout_id))
    {
        layouts[index] = layout.clone();
    } else {
        layouts.push(layout.clone());
    }
    Ok(())
}

fn delete_layout(session: &mut Value, layout_id: &str) -> Result<(), String> {
    validate_identifier("workspace layout id", layout_id)?;
    if BUILTIN_LAYOUT_IDS.contains(&layout_id) {
        return Err("Built-in workspace layouts cannot be deleted.".into());
    }
    let workspace = session_object_mut(session)?
        .get_mut("workspace")
        .and_then(Value::as_object_mut)
        .ok_or("Project workspace is malformed.")?;
    let layouts = workspace
        .get_mut("layouts")
        .and_then(Value::as_array_mut)
        .ok_or("Project workspace layouts are malformed.")?;
    layouts.retain(|layout| layout.get("id").and_then(Value::as_str) != Some(layout_id));
    if workspace.get("activeLayoutId").and_then(Value::as_str) == Some(layout_id) {
        workspace.insert("activeLayoutId".into(), Value::String("writer".into()));
    }
    if let Some(shortcuts) = workspace
        .get_mut("shortcuts")
        .and_then(Value::as_object_mut)
    {
        shortcuts.remove(&format!("layout:{layout_id}"));
    }
    Ok(())
}

fn validate_expected_fingerprint(block: &Value, expected: Option<&str>) -> Result<(), String> {
    let Some(expected) = expected else {
        return Ok(());
    };
    let ordered = screenplay_block_json(block)?;
    let sorted = serde_json::to_string(block)
        .map_err(|error| format!("Screenplay block could not be fingerprinted: {error}"))?;
    if expected != coordinator_fingerprint(&ordered) && expected != coordinator_fingerprint(&sorted)
    {
        return Err("Block changed since the mutation was created.".into());
    }
    Ok(())
}

fn screenplay_block_json(block: &Value) -> Result<String, String> {
    ordered_object_json(
        block,
        &[
            "id",
            "type",
            "text",
            "textRuns",
            "sceneId",
            "originalType",
            "metadata",
        ],
        Some("textRuns"),
    )
}

fn ordered_object_json(
    value: &Value,
    keys: &[&str],
    ordered_array_key: Option<&str>,
) -> Result<String, String> {
    let object = value
        .as_object()
        .ok_or("Screenplay fingerprint value is malformed.")?;
    let mut fields = Vec::new();
    for key in keys {
        let Some(field) = object.get(*key) else {
            continue;
        };
        let serialized = if ordered_array_key == Some(*key) {
            let runs = field
                .as_array()
                .ok_or("Screenplay text runs are malformed.")?;
            let values: Result<Vec<_>, _> = runs
                .iter()
                .map(|run| {
                    ordered_object_json(
                        run,
                        &[
                            "text",
                            "bold",
                            "italic",
                            "underline",
                            "strikeout",
                            "revisionId",
                            "metadata",
                        ],
                        None,
                    )
                })
                .collect();
            format!("[{}]", values?.join(","))
        } else {
            serde_json::to_string(field)
                .map_err(|error| format!("Screenplay value could not be fingerprinted: {error}"))?
        };
        fields.push(format!(
            "{}:{serialized}",
            serde_json::to_string(key)
                .map_err(|error| format!("Screenplay key could not be fingerprinted: {error}"))?
        ));
    }
    Ok(format!("{{{}}}", fields.join(",")))
}

fn coordinator_fingerprint(source: &str) -> String {
    let hash = source.encode_utf16().fold(2_166_136_261_u32, |hash, unit| {
        (hash ^ u32::from(unit)).wrapping_mul(16_777_619)
    });
    format!("block-{hash:08x}")
}

fn session_object_mut(session: &mut Value) -> Result<&mut Map<String, Value>, String> {
    session
        .as_object_mut()
        .ok_or_else(|| "Coordinated session is malformed.".into())
}

fn documents_mut(session: &mut Value) -> Result<&mut Vec<Value>, String> {
    session_object_mut(session)?
        .get_mut("documents")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Coordinated session documents are malformed.".into())
}

fn blocks_mut<'a>(session: &'a mut Value, document_id: &str) -> Result<&'a mut Vec<Value>, String> {
    let documents = documents_mut(session)?;
    let index = document_index(documents, document_id)?;
    documents[index]
        .as_object_mut()
        .and_then(|document| document.get_mut("blocks"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Screenplay blocks are malformed.".into())
}

fn document_index(documents: &[Value], document_id: &str) -> Result<usize, String> {
    documents
        .iter()
        .position(|document| value_id(document).ok() == Some(document_id))
        .ok_or_else(|| "Document no longer exists.".into())
}

fn block_index(blocks: &[Value], block_id: &str) -> Result<usize, String> {
    blocks
        .iter()
        .position(|block| value_id(block).ok() == Some(block_id))
        .ok_or_else(|| "Block no longer exists.".into())
}

fn value_id(value: &Value) -> Result<&str, String> {
    value
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "Value id is missing.".into())
}

fn collision_resistant_id(prefix: &str, counter: &AtomicU64) -> String {
    let count = counter.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    format!("{prefix}-{:x}-{timestamp:x}-{count:x}", std::process::id())
}

#[tauri::command(rename_all = "camelCase")]
pub fn register_coordinated_session(
    window: WebviewWindow,
    state: State<'_, SessionCoordinatorState>,
    windows: State<'_, WindowManagerState>,
    session_id: String,
    session: Value,
) -> Result<CoordinatorSnapshot, String> {
    let project_id = validate_session(&session)?;
    if !windows.authorizes_project(&project_id, window.label())? {
        return Err("Only a registered project window can establish its session authority.".into());
    }
    state.register(session_id, session)
}

#[tauri::command(rename_all = "camelCase")]
pub fn coordinator_snapshot(
    window: WebviewWindow,
    state: State<'_, SessionCoordinatorState>,
    windows: State<'_, WindowManagerState>,
    project_id: String,
    session_id: String,
) -> Result<CoordinatorSnapshot, String> {
    if !windows.authorizes_project(&project_id, window.label())? {
        return Err("Only a registered project window can read its session authority.".into());
    }
    state.snapshot(&project_id, &session_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn submit_coordinated_mutation(
    app: AppHandle,
    window: WebviewWindow,
    coordinator: State<'_, SessionCoordinatorState>,
    windows: State<'_, WindowManagerState>,
    envelope: SessionMutationEnvelope,
) -> Result<SubmitMutationResult, String> {
    if !windows.authorizes(
        &envelope.project_id,
        &envelope.origin_window_id,
        window.label(),
    )? {
        return Ok(bare_rejection(
            MutationDisposition::Rejected,
            MutationRejectionReason::WrongOrigin,
            "The mutation origin does not match its registered native window.".into(),
        ));
    }
    let project_id = envelope.project_id.clone();
    let result = coordinator.submit(envelope);
    if let Some(accepted) = &result.accepted {
        if let Ok(labels) = windows.labels_for_project(&project_id) {
            for label in labels {
                if label != window.label() {
                    let _ = app.emit_to(&label, SESSION_REVISION_EVENT, accepted);
                }
            }
        }
    }
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub fn request_coordinated_save(
    window: WebviewWindow,
    state: State<'_, SessionCoordinatorState>,
    windows: State<'_, WindowManagerState>,
    project_id: String,
    session_id: String,
    revision: u64,
    kind: SaveKind,
) -> Result<SaveIntentResult, String> {
    let record = windows
        .record_for_label(window.label())?
        .filter(|record| record.project_id == project_id)
        .ok_or("Only a registered project window can request a coordinated save.")?;
    if !record.is_leader {
        return Err("Only the project leader window can request a coordinated save.".into());
    }
    let result = state.request_save(&project_id, &session_id, &record.window_id, revision, kind)?;
    if !windows.authorizes(&project_id, &record.window_id, window.label())? {
        state.abandon_save_owner(&project_id, &record.window_id)?;
        return Err("The save owner window closed before its request was registered.".into());
    }
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub fn complete_coordinated_save(
    window: WebviewWindow,
    state: State<'_, SessionCoordinatorState>,
    windows: State<'_, WindowManagerState>,
    project_id: String,
    session_id: String,
    intent_id: String,
    success: bool,
) -> Result<SaveCompletionResult, String> {
    let record = windows
        .record_for_label(window.label())?
        .filter(|record| record.project_id == project_id)
        .ok_or("Only a registered project window can complete a coordinated save.")?;
    if !record.is_leader {
        return Err("Only the project leader window can complete a coordinated save.".into());
    }
    state.complete_save(
        &project_id,
        &session_id,
        &record.window_id,
        &intent_id,
        success,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, Barrier};
    use std::thread;

    fn session() -> Value {
        json!({
            "schemaVersion": 4,
            "projectId": "project-test",
            "name": "Test",
            "projectType": "featureFilm",
            "createdAt": "2026-08-17T00:00:00Z",
            "updatedAt": "2026-08-17T00:00:00Z",
            "documents": [{
                "id": "doc-1",
                "titlePage": { "title": "Test", "author": "" },
                "blocks": [
                    { "id": "block-1", "type": "action", "text": "One" },
                    { "id": "block-2", "type": "action", "text": "Two" }
                ],
                "sceneNotes": {}
            }, {
                "id": "doc-2",
                "titlePage": { "title": "Second", "author": "" },
                "blocks": [{ "id": "block-3", "type": "action", "text": "Three" }],
                "sceneNotes": {}
            }],
            "versions": [],
            "versionHistory": { "snapshots": [], "branches": [], "activeBranchId": "" },
            "workspace": {
                "collaborators": [{ "id": "local-owner", "name": "Local writer", "role": "owner" }],
                "currentUserId": "local-owner",
                "layouts": [],
                "activeLayoutId": "writer",
                "reviews": [],
                "writerRoom": { "tasks": [] },
                "series": { "continuity": [], "episodes": {}, "seasons": [] }
            },
            "projectPath": "",
            "activeDocumentId": "doc-1"
        })
    }

    fn envelope(action: &str, block: &str, text: &str) -> SessionMutationEnvelope {
        SessionMutationEnvelope {
            protocol_version: 1,
            project_id: "project-test".into(),
            session_id: "session-test".into(),
            origin_window_id: "window-main".into(),
            actor_id: "local-owner".into(),
            action_id: action.into(),
            base_revision: 0,
            issued_at: format!("2026-08-17T00:00:0{}Z", &action[action.len() - 1..]),
            payload: SessionMutation::ReplaceBlock {
                document_id: "doc-1".into(),
                block_id: block.into(),
                block: json!({ "id": block, "type": "action", "text": text }),
                expected_fingerprint: None,
            },
        }
    }

    fn document_envelope(
        action: &str,
        document_index: usize,
        title: &str,
    ) -> SessionMutationEnvelope {
        let mut document = session()["documents"][document_index].clone();
        document["titlePage"]["title"] = json!(title);
        SessionMutationEnvelope {
            protocol_version: 1,
            project_id: "project-test".into(),
            session_id: "session-test".into(),
            origin_window_id: "window-main".into(),
            actor_id: "local-owner".into(),
            action_id: action.into(),
            base_revision: 0,
            issued_at: "2026-08-17T00:00:10Z".into(),
            payload: SessionMutation::ReplaceDocument {
                document_id: document["id"].as_str().unwrap().into(),
                document,
            },
        }
    }

    #[test]
    fn register_validates_and_returns_the_authoritative_snapshot() {
        let coordinator = SessionCoordinatorState::default();
        let snapshot = coordinator
            .register("session-test".into(), session())
            .unwrap();
        assert_eq!(snapshot.project_id, "project-test");
        assert_eq!(snapshot.revision, 0);
        assert!(coordinator
            .register("another-session".into(), session())
            .is_err());
        assert!(coordinator.release_project("project-test").unwrap());
        assert!(coordinator
            .register("another-session".into(), session())
            .is_ok());
        let mut malformed = session();
        malformed["documents"][1]["id"] = json!("doc-1");
        assert!(SessionCoordinatorState::default()
            .register("session-test".into(), malformed)
            .is_err());
    }

    #[test]
    fn concurrent_edits_to_different_blocks_reconcile_without_loss() {
        let coordinator = Arc::new(SessionCoordinatorState::default());
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let barrier = Arc::new(Barrier::new(3));
        let handles: Vec<_> = [
            ("action-1", "block-1", "First"),
            ("action-2", "block-2", "Second"),
        ]
        .into_iter()
        .map(|(action, block, text)| {
            let coordinator = Arc::clone(&coordinator);
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                coordinator.submit(envelope(action, block, text))
            })
        })
        .collect();
        barrier.wait();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert!(results.iter().all(|result| matches!(
            result.disposition,
            MutationDisposition::Accepted | MutationDisposition::Reconciled
        )));
        let snapshot = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert_eq!(snapshot.revision, 2);
        assert_eq!(
            snapshot.session["documents"][0]["blocks"][0]["text"],
            "First"
        );
        assert_eq!(
            snapshot.session["documents"][0]["blocks"][1]["text"],
            "Second"
        );
    }

    #[test]
    fn concurrent_replacements_of_different_documents_reconcile_without_loss() {
        let coordinator = Arc::new(SessionCoordinatorState::default());
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let barrier = Arc::new(Barrier::new(3));
        let handles: Vec<_> = [
            ("document-action-1", 0, "First Draft"),
            ("document-action-2", 1, "Second Draft"),
        ]
        .into_iter()
        .map(|(action, index, title)| {
            let coordinator = Arc::clone(&coordinator);
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                coordinator.submit(document_envelope(action, index, title))
            })
        })
        .collect();
        barrier.wait();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert!(results.iter().all(|result| matches!(
            result.disposition,
            MutationDisposition::Accepted | MutationDisposition::Reconciled
        )));
        let snapshot = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert_eq!(snapshot.revision, 2);
        assert_eq!(
            snapshot.session["documents"][0]["titlePage"]["title"],
            "First Draft"
        );
        assert_eq!(
            snapshot.session["documents"][1]["titlePage"]["title"],
            "Second Draft"
        );
    }

    #[test]
    fn concurrent_edits_to_the_same_block_reject_one_stale_action() {
        let coordinator = Arc::new(SessionCoordinatorState::default());
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let barrier = Arc::new(Barrier::new(3));
        let handles: Vec<_> = [("action-1", "Alpha"), ("action-2", "Beta")]
            .into_iter()
            .map(|(action, text)| {
                let coordinator = Arc::clone(&coordinator);
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    coordinator.submit(envelope(action, "block-1", text))
                })
            })
            .collect();
        barrier.wait();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert_eq!(
            results
                .iter()
                .filter(|result| result.disposition == MutationDisposition::Accepted)
                .count(),
            1
        );
        assert_eq!(
            results
                .iter()
                .filter(|result| {
                    result.disposition == MutationDisposition::Rejected
                        && result.reason == Some(MutationRejectionReason::StaleConflict)
                })
                .count(),
            1
        );
        assert_eq!(
            coordinator
                .snapshot("project-test", "session-test")
                .unwrap()
                .revision,
            1
        );
    }

    #[test]
    fn action_ids_are_idempotent_and_future_revisions_resync() {
        let coordinator = SessionCoordinatorState::default();
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let action = envelope("action-1", "block-1", "Once");
        assert_eq!(
            coordinator.submit(action.clone()).disposition,
            MutationDisposition::Accepted
        );
        assert_eq!(
            coordinator.submit(action).disposition,
            MutationDisposition::Duplicate
        );
        let mut future = envelope("action-2", "block-2", "Future");
        future.base_revision = 99;
        let result = coordinator.submit(future);
        assert_eq!(result.disposition, MutationDisposition::Resync);
        assert_eq!(result.reason, Some(MutationRejectionReason::FutureRevision));
    }

    #[test]
    fn protocol_actor_permissions_and_block_fingerprints_are_enforced() {
        let coordinator = SessionCoordinatorState::default();
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let mut unsupported = envelope("protocol-action-1", "block-1", "Changed");
        unsupported.protocol_version = 2;
        let result = coordinator.submit(unsupported);
        assert_eq!(
            result.reason,
            Some(MutationRejectionReason::InvalidEnvelope)
        );

        let mut viewer_session = session();
        viewer_session["workspace"]["collaborators"]
            .as_array_mut()
            .unwrap()
            .push(json!({ "id": "read-only", "name": "Reader", "role": "viewer" }));
        viewer_session["workspace"]["currentUserId"] = json!("read-only");
        let viewer_coordinator = SessionCoordinatorState::default();
        viewer_coordinator
            .register("session-test".into(), viewer_session)
            .unwrap();
        let forged_owner = envelope("viewer-action-1", "block-1", "Forged owner edit");
        let result = viewer_coordinator.submit(forged_owner);
        assert_eq!(result.reason, Some(MutationRejectionReason::Permission));
        assert!(result
            .message
            .as_deref()
            .is_some_and(|message| message.contains("authoritative local project identity")));

        let mut viewer_action = envelope("viewer-action-2", "block-1", "Forbidden");
        viewer_action.actor_id = "read-only".into();
        let result = viewer_coordinator.submit(viewer_action);
        assert_eq!(result.reason, Some(MutationRejectionReason::Permission));

        let mut fingerprinted = envelope("fingerprint-action-1", "block-1", "Accepted");
        if let SessionMutation::ReplaceBlock {
            expected_fingerprint,
            ..
        } = &mut fingerprinted.payload
        {
            *expected_fingerprint = Some("block-0da7d04c".into());
        }
        assert_eq!(
            coordinator.submit(fingerprinted).disposition,
            MutationDisposition::Accepted
        );
        assert_eq!(
            coordinator
                .snapshot("project-test", "session-test")
                .unwrap()
                .session["updatedAt"],
            "2026-08-17T00:00:00Z"
        );

        let mismatch_coordinator = SessionCoordinatorState::default();
        mismatch_coordinator
            .register("session-test".into(), session())
            .unwrap();
        let mut mismatch = envelope("fingerprint-action-2", "block-1", "Rejected");
        if let SessionMutation::ReplaceBlock {
            expected_fingerprint,
            ..
        } = &mut mismatch.payload
        {
            *expected_fingerprint = Some("block-deadbeef".into());
        }
        let result = mismatch_coordinator.submit(mismatch);
        assert_eq!(
            result.reason,
            Some(MutationRejectionReason::InvalidMutation)
        );
    }

    #[test]
    fn persistence_metadata_reconciles_with_concurrent_content_without_changing_the_disk_token_on_edit(
    ) {
        let coordinator = SessionCoordinatorState::default();
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let edit = envelope("content-action-1", "block-1", "Concurrent edit");
        assert_eq!(
            coordinator.submit(edit).disposition,
            MutationDisposition::Accepted
        );
        let after_edit = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert_eq!(after_edit.session["updatedAt"], "2026-08-17T00:00:00Z");

        let mut completion = envelope("persistence-action-1", "block-2", "unused");
        completion.payload = SessionMutation::Batch {
            mutations: vec![
                AtomicSessionMutation::SetProjectName {
                    name: "Saved Project".into(),
                },
                AtomicSessionMutation::SetPersistenceMetadata {
                    project_path: "C:/Projects/saved.scsproject".into(),
                    updated_at: "2026-08-17T00:10:00Z".into(),
                },
            ],
        };
        let result = coordinator.submit(completion);
        assert_eq!(result.disposition, MutationDisposition::Reconciled);
        let snapshot = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert_eq!(
            snapshot.session["documents"][0]["blocks"][0]["text"],
            "Concurrent edit"
        );
        assert_eq!(snapshot.session["name"], "Saved Project");
        assert_eq!(
            snapshot.session["projectPath"],
            "C:/Projects/saved.scsproject"
        );
        assert_eq!(snapshot.session["updatedAt"], "2026-08-17T00:10:00Z");
    }

    #[test]
    fn document_removal_requires_recovery_and_cleans_portable_references() {
        let mut input = session();
        let documents = input["documents"].clone();
        input["versionHistory"]["snapshots"] = json!([{
            "id": "snapshot-remove",
            "session": { "documents": documents }
        }]);
        input["versions"] = json!([{
            "id": "legacy-version",
            "document": input["documents"][0].clone()
        }]);
        input["workspace"]["reviews"] = json!([{
            "id": "review-1",
            "targetType": "episode",
            "targetId": "doc-1",
            "documentId": "doc-1"
        }]);
        input["workspace"]["writerRoom"] = json!({
            "activeDocumentId": "doc-1",
            "activeSceneId": "block-1",
            "tasks": [{ "id": "task-1", "documentId": "doc-1" }]
        });
        input["workspace"]["series"] = json!({
            "continuity": [{ "id": "continuity-1", "episodeIds": ["doc-1", "doc-2"] }],
            "episodes": { "doc-1": {}, "doc-2": {} },
            "seasons": [{ "id": "season-1", "episodeIds": ["doc-1", "doc-2"] }]
        });
        let coordinator = SessionCoordinatorState::default();
        coordinator.register("session-test".into(), input).unwrap();
        let mut action = envelope("remove-action-1", "block-1", "unused");
        action.payload = SessionMutation::RemoveDocument {
            document_id: "doc-1".into(),
            recovery_snapshot_id: "snapshot-remove".into(),
        };
        assert_eq!(
            coordinator.submit(action).disposition,
            MutationDisposition::Accepted
        );
        let snapshot = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert_eq!(snapshot.session["documents"].as_array().unwrap().len(), 1);
        assert_eq!(snapshot.session["activeDocumentId"], "doc-2");
        assert!(snapshot.session["versions"].as_array().unwrap().is_empty());
        assert!(snapshot.session["workspace"]["reviews"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(snapshot.session["workspace"]["writerRoom"]["tasks"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(
            snapshot.session["workspace"]["series"]["continuity"][0]["episodeIds"],
            json!(["doc-2"])
        );
    }

    #[test]
    fn custom_layout_mutations_preserve_window_local_active_layout() {
        let coordinator = SessionCoordinatorState::default();
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        let layout = json!({
            "id": "custom-writing",
            "name": "Custom Writing",
            "navigator": "left",
            "inspector": "right",
            "reference": "none",
            "navigatorWidth": 260,
            "inspectorWidth": 320,
            "panels": [{ "id": "screenplay", "title": "Screenplay", "kind": "screenplay", "closable": false }],
            "tabGroups": [{ "id": "main-tabs", "panelIds": ["screenplay"], "activePanelId": "screenplay" }],
            "splits": [],
            "floatingPanels": [],
            "synchronizedPanels": []
        });
        let dock_tree_layout = json!({
            "layoutVersion": 2,
            "id": "custom-dock-tree",
            "name": "Custom Dock Tree",
            "navigator": "left",
            "inspector": "right",
            "reference": "none",
            "navigatorWidth": 260,
            "inspectorWidth": 320,
            "panels": [{ "id": "screenplay", "title": "Screenplay", "kind": "screenplay", "closable": false }],
            "root": { "kind": "tabs", "id": "main-tabs", "panelIds": ["screenplay"], "activePanelId": "screenplay" },
            "floatingPanels": [],
            "hiddenPanelIds": [],
            "synchronizedPanels": []
        });
        assert_eq!(
            validate_custom_layout(&dock_tree_layout).unwrap(),
            "custom-dock-tree"
        );
        let mut upsert = envelope("layout-action-1", "block-1", "unused");
        upsert.payload = SessionMutation::UpsertLayout {
            layout: layout.clone(),
        };
        assert_eq!(
            coordinator.submit(upsert).disposition,
            MutationDisposition::Accepted
        );
        let snapshot = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert_eq!(snapshot.session["workspace"]["activeLayoutId"], "writer");
        assert_eq!(snapshot.session["workspace"]["layouts"][0], layout);

        let mut stale_workspace = envelope("layout-action-stale", "block-1", "unused");
        stale_workspace.payload = SessionMutation::SetWorkspace {
            workspace: session()["workspace"].clone(),
        };
        let result = coordinator.submit(stale_workspace);
        assert_eq!(result.reason, Some(MutationRejectionReason::StaleConflict));

        let mut delete = envelope("layout-action-2", "block-1", "unused");
        delete.base_revision = 1;
        delete.payload = SessionMutation::DeleteLayout {
            layout_id: "custom-writing".into(),
        };
        assert_eq!(
            coordinator.submit(delete).disposition,
            MutationDisposition::Accepted
        );
        let snapshot = coordinator
            .snapshot("project-test", "session-test")
            .unwrap();
        assert!(snapshot.session["workspace"]["layouts"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(snapshot.session["workspace"]["activeLayoutId"], "writer");

        let mut legacy_portable_session = session();
        legacy_portable_session["workspace"]["layouts"] = json!([layout]);
        legacy_portable_session["workspace"]["activeLayoutId"] = json!("custom-writing");
        legacy_portable_session["workspace"]["shortcuts"] = json!({
            "layout:custom-writing": "Mod+Alt+9",
            "command-palette": "Mod+K"
        });
        delete_layout(&mut legacy_portable_session, "custom-writing").unwrap();
        assert_eq!(
            legacy_portable_session["workspace"]["activeLayoutId"],
            "writer"
        );
        assert!(legacy_portable_session["workspace"]["shortcuts"]
            .get("layout:custom-writing")
            .is_none());
        assert_eq!(
            legacy_portable_session["workspace"]["shortcuts"]["command-palette"],
            "Mod+K"
        );
    }

    #[test]
    fn save_intents_are_serialized_without_dropping_either_save_kind() {
        let coordinator = SessionCoordinatorState::default();
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        coordinator.submit(envelope("action-1", "block-1", "First"));
        coordinator.submit({
            let mut action = envelope("action-2", "block-2", "Second");
            action.base_revision = 1;
            action
        });
        let first = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                1,
                SaveKind::Recovery,
            )
            .unwrap();
        assert_eq!(first.disposition, SaveIntentDisposition::Start);
        let recovery = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                2,
                SaveKind::Recovery,
            )
            .unwrap();
        assert_eq!(recovery.disposition, SaveIntentDisposition::Queued);
        let coalesced_recovery = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                2,
                SaveKind::Recovery,
            )
            .unwrap();
        assert_eq!(
            coalesced_recovery.intent.intent_id,
            recovery.intent.intent_id
        );
        let portable = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                2,
                SaveKind::Portable,
            )
            .unwrap();
        assert_eq!(portable.disposition, SaveIntentDisposition::Queued);
        let completed = coordinator
            .complete_save(
                "project-test",
                "session-test",
                "window-main",
                &first.intent.intent_id,
                true,
            )
            .unwrap();
        assert_eq!(completed.last_recovery_revision, Some(1));
        assert_eq!(
            completed.next.as_ref().map(|intent| intent.kind),
            Some(SaveKind::Recovery)
        );
        let second = completed.next.unwrap();
        let completed = coordinator
            .complete_save(
                "project-test",
                "session-test",
                "window-main",
                &second.intent_id,
                true,
            )
            .unwrap();
        assert_eq!(completed.last_recovery_revision, Some(2));
        assert_eq!(
            completed.next.as_ref().map(|intent| intent.kind),
            Some(SaveKind::Portable)
        );
        let third = completed.next.unwrap();
        let completed = coordinator
            .complete_save(
                "project-test",
                "session-test",
                "window-main",
                &third.intent_id,
                true,
            )
            .unwrap();
        assert_eq!(completed.last_portable_revision, Some(2));
        assert!(!completed.dirty);

        let repeated_portable = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                2,
                SaveKind::Portable,
            )
            .unwrap();
        assert_eq!(repeated_portable.disposition, SaveIntentDisposition::Start);
    }

    #[test]
    fn abandoned_save_owner_cannot_strand_the_queue_or_complete_after_takeover() {
        let coordinator = SessionCoordinatorState::default();
        coordinator
            .register("session-test".into(), session())
            .unwrap();
        coordinator.submit(envelope("action-1", "block-1", "First"));
        coordinator.submit({
            let mut action = envelope("action-2", "block-2", "Second");
            action.base_revision = 1;
            action
        });
        let abandoned = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                1,
                SaveKind::Portable,
            )
            .unwrap();
        let queued = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-main",
                2,
                SaveKind::Recovery,
            )
            .unwrap();
        assert_eq!(queued.disposition, SaveIntentDisposition::Queued);
        assert_eq!(
            coordinator
                .abandon_save_owner("project-test", "window-main")
                .unwrap()
                .as_ref()
                .map(|intent| intent.intent_id.as_str()),
            Some(abandoned.intent.intent_id.as_str())
        );

        let takeover = coordinator
            .request_save(
                "project-test",
                "session-test",
                "window-two",
                2,
                SaveKind::Recovery,
            )
            .unwrap();
        assert_eq!(takeover.disposition, SaveIntentDisposition::Start);
        assert!(coordinator
            .complete_save(
                "project-test",
                "session-test",
                "window-main",
                &takeover.intent.intent_id,
                true,
            )
            .is_err());
        let completed = coordinator
            .complete_save(
                "project-test",
                "session-test",
                "window-two",
                &takeover.intent.intent_id,
                true,
            )
            .unwrap();
        assert_eq!(completed.last_recovery_revision, Some(2));
        let retry = completed.next.expect("abandoned portable save is retried");
        assert_eq!(retry.kind, SaveKind::Portable);
        assert_eq!(retry.revision, 1);
        let completed = coordinator
            .complete_save(
                "project-test",
                "session-test",
                "window-two",
                &retry.intent_id,
                false,
            )
            .unwrap();
        assert!(completed.next.is_none());
        assert_eq!(completed.last_portable_revision, None);
        assert!(completed.dirty);
    }
}
