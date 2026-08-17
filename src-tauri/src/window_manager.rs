use crate::session_coordinator::SessionCoordinatorState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};

const REGISTRY_EVENT: &str = "scs://window-registry";
const CLOSE_REQUESTED_EVENT: &str = "scs://window-close-requested";
const DRAG_PREVIEW_EVENT: &str = "scs://drag-preview";
const DRAG_ACKNOWLEDGED_EVENT: &str = "scs://drag-acknowledged";
const DRAG_CANCELLED_EVENT: &str = "scs://drag-cancelled";
const MIN_WINDOW_WIDTH: u32 = 980;
const MIN_WINDOW_HEIGHT: u32 = 620;

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(1);
static DRAG_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct WindowManagerState {
    inner: Mutex<WindowManagerInner>,
}

#[derive(Default)]
struct WindowManagerInner {
    projects: HashMap<String, ProjectWindowRegistry>,
    label_index: HashMap<String, (String, String)>,
    drags: HashMap<String, InternalDragSession>,
}

struct ProjectWindowRegistry {
    leader_window_id: String,
    next_registration_order: u64,
    windows: HashMap<String, ProjectWindowRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWindowRecord {
    pub window_id: String,
    pub label: String,
    pub project_id: String,
    pub slot_id: String,
    pub registration_order: u64,
    pub view_revision: u64,
    pub is_leader: bool,
    pub geometry: Option<WindowGeometry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowRegistrySnapshot {
    pub project_id: String,
    pub leader_window_id: String,
    pub windows: Vec<ProjectWindowRecord>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonitorBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceWindowRequest {
    pub project_id: String,
    pub session_id: String,
    pub slot_id: String,
    pub geometry: Option<WindowGeometry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CloseDispositionKind {
    Secondary,
    PromoteLeader,
    FinalWindow,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloseDisposition {
    pub kind: CloseDispositionKind,
    pub window_id: String,
    pub next_leader_window_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LeaveWorkspaceResult {
    pub project_id: String,
    pub window_id: String,
    pub remaining_window_count: usize,
    pub leader_window_id: Option<String>,
    pub released_session: bool,
}

struct WindowUnregistration {
    record: ProjectWindowRecord,
    snapshot: Option<WindowRegistrySnapshot>,
    cancelled_drags: Vec<InternalDragSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum InternalDragPayload {
    DocumentTab { document_id: String },
    WorkspacePanel { panel_id: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InternalDragEffect {
    Move,
    Copy,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DockEdge {
    Center,
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum InternalDragPlacement {
    DocumentTabs { index: u32 },
    DockGroup { group_id: String, edge: DockEdge },
    FloatingLayer,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InternalDragTarget {
    pub window_id: String,
    pub view_revision: u64,
    pub placement: InternalDragPlacement,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BeginInternalDragRequest {
    pub project_id: String,
    pub source_window_id: String,
    pub source_view_revision: u64,
    pub session_revision: u64,
    pub payload: InternalDragPayload,
    pub effect: InternalDragEffect,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InternalDragSession {
    pub drag_id: String,
    pub project_id: String,
    pub source_window_id: String,
    pub source_view_revision: u64,
    pub session_revision: u64,
    pub payload: InternalDragPayload,
    pub effect: InternalDragEffect,
    pub target: Option<InternalDragTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DragAcknowledgement {
    pub drag_id: String,
    pub project_id: String,
    pub source_window_id: String,
    pub destination_window_id: String,
    pub source_view_revision: u64,
    pub destination_view_revision: u64,
    pub payload: InternalDragPayload,
    pub effect: InternalDragEffect,
    pub placement: InternalDragPlacement,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcknowledgeInternalDragRequest {
    pub project_id: String,
    pub session_id: String,
    pub drag_id: String,
    pub destination_window_id: String,
}

impl WindowManagerState {
    pub fn register(
        &self,
        project_id: String,
        window_id: String,
        label: String,
        slot_id: String,
    ) -> Result<WindowRegistrySnapshot, String> {
        validate_identifier("project id", &project_id)?;
        validate_identifier("window id", &window_id)?;
        validate_window_label(&label)?;
        validate_identifier("window slot id", &slot_id)?;
        let mut inner = self.lock()?;
        if let Some((indexed_project, indexed_window)) = inner.label_index.get(&label) {
            if indexed_project == &project_id && indexed_window == &window_id {
                return inner.snapshot(&project_id);
            }
            return Err("The native window label is already registered.".into());
        }
        {
            let registry =
                inner
                    .projects
                    .entry(project_id.clone())
                    .or_insert_with(|| ProjectWindowRegistry {
                        leader_window_id: window_id.clone(),
                        next_registration_order: 0,
                        windows: HashMap::new(),
                    });
            if registry.windows.contains_key(&window_id) {
                return Err("The window id is already registered to another native window.".into());
            }
            if registry
                .windows
                .values()
                .any(|record| record.slot_id == slot_id)
            {
                return Err("The machine-local window slot is already active.".into());
            }
            let order = registry.next_registration_order;
            registry.next_registration_order += 1;
            registry.windows.insert(
                window_id.clone(),
                ProjectWindowRecord {
                    window_id: window_id.clone(),
                    label: label.clone(),
                    project_id: project_id.clone(),
                    slot_id,
                    registration_order: order,
                    view_revision: 0,
                    is_leader: registry.leader_window_id == window_id,
                    geometry: None,
                },
            );
        }
        inner
            .label_index
            .insert(label, (project_id.clone(), window_id));
        inner.snapshot(&project_id)
    }

    pub fn unregister_by_label(
        &self,
        label: &str,
    ) -> Result<Option<WindowRegistrySnapshot>, String> {
        Ok(self
            .unregister_window_by_label(label)?
            .and_then(|unregistration| unregistration.snapshot))
    }

    fn unregister_window_by_label(
        &self,
        label: &str,
    ) -> Result<Option<WindowUnregistration>, String> {
        let mut inner = self.lock()?;
        let Some((project_id, window_id)) = inner.label_index.get(label).cloned() else {
            return Ok(None);
        };
        let (record, remove_project) = {
            let registry = inner
                .projects
                .get_mut(&project_id)
                .ok_or("The project window registry is malformed.")?;
            let record = registry
                .windows
                .remove(&window_id)
                .ok_or("The project window registry is malformed.")?;
            let mut remove_project = false;
            if registry.windows.is_empty() {
                remove_project = true;
            } else if registry.leader_window_id == window_id {
                registry.leader_window_id = registry
                    .windows
                    .values()
                    .min_by_key(|record| record.registration_order)
                    .expect("non-empty registry has a leader candidate")
                    .window_id
                    .clone();
                registry.refresh_leader_flags();
            }
            (record, remove_project)
        };
        inner.label_index.remove(label);
        let cancelled_ids: Vec<_> = inner
            .drags
            .iter()
            .filter(|(_, drag)| {
                drag.source_window_id == window_id
                    || drag
                        .target
                        .as_ref()
                        .is_some_and(|target| target.window_id == window_id)
            })
            .map(|(drag_id, _)| drag_id.clone())
            .collect();
        let cancelled_drags = cancelled_ids
            .into_iter()
            .filter_map(|drag_id| inner.drags.remove(&drag_id))
            .collect();
        let snapshot = if remove_project {
            inner.projects.remove(&project_id);
            None
        } else {
            Some(inner.snapshot(&project_id)?)
        };
        Ok(Some(WindowUnregistration {
            record,
            snapshot,
            cancelled_drags,
        }))
    }

    pub fn contains_label(&self, label: &str) -> Result<bool, String> {
        Ok(self.lock()?.label_index.contains_key(label))
    }

    pub fn authorizes(
        &self,
        project_id: &str,
        window_id: &str,
        label: &str,
    ) -> Result<bool, String> {
        let inner = self.lock()?;
        Ok(inner
            .label_index
            .get(label)
            .is_some_and(|(project, window)| project == project_id && window == window_id))
    }

    pub fn authorizes_project(&self, project_id: &str, label: &str) -> Result<bool, String> {
        Ok(self
            .lock()?
            .label_index
            .get(label)
            .is_some_and(|(project, _)| project == project_id))
    }

    pub fn labels_for_project(&self, project_id: &str) -> Result<Vec<String>, String> {
        let inner = self.lock()?;
        let registry = inner
            .projects
            .get(project_id)
            .ok_or("The project window registry is not active.")?;
        Ok(registry
            .windows
            .values()
            .map(|record| record.label.clone())
            .collect())
    }

    pub fn snapshot(&self, project_id: &str) -> Result<WindowRegistrySnapshot, String> {
        self.lock()?.snapshot(project_id)
    }

    pub fn record_for_window(
        &self,
        project_id: &str,
        window_id: &str,
    ) -> Result<ProjectWindowRecord, String> {
        let inner = self.lock()?;
        inner
            .projects
            .get(project_id)
            .and_then(|registry| registry.windows.get(window_id))
            .cloned()
            .ok_or_else(|| "The native project window is not registered.".into())
    }

    pub fn record_for_label(&self, label: &str) -> Result<Option<ProjectWindowRecord>, String> {
        let inner = self.lock()?;
        let Some((project_id, window_id)) = inner.label_index.get(label) else {
            return Ok(None);
        };
        Ok(inner
            .projects
            .get(project_id)
            .and_then(|registry| registry.windows.get(window_id))
            .cloned())
    }

    pub fn close_disposition_for_label(
        &self,
        label: &str,
    ) -> Result<Option<CloseDisposition>, String> {
        let inner = self.lock()?;
        let Some((project_id, window_id)) = inner.label_index.get(label) else {
            return Ok(None);
        };
        let registry = inner
            .projects
            .get(project_id)
            .ok_or("The project window registry is malformed.")?;
        let kind = if registry.windows.len() == 1 {
            CloseDispositionKind::FinalWindow
        } else if registry.leader_window_id == *window_id {
            CloseDispositionKind::PromoteLeader
        } else {
            CloseDispositionKind::Secondary
        };
        let next_leader_window_id = (kind == CloseDispositionKind::PromoteLeader).then(|| {
            registry
                .windows
                .values()
                .filter(|record| record.window_id != *window_id)
                .min_by_key(|record| record.registration_order)
                .expect("leader promotion has another window")
                .window_id
                .clone()
        });
        Ok(Some(CloseDisposition {
            kind,
            window_id: window_id.clone(),
            next_leader_window_id,
        }))
    }

    pub fn update_geometry_by_label(
        &self,
        label: &str,
        geometry: WindowGeometry,
    ) -> Result<(), String> {
        let mut inner = self.lock()?;
        let Some((project_id, window_id)) = inner.label_index.get(label).cloned() else {
            return Ok(());
        };
        if let Some(record) = inner
            .projects
            .get_mut(&project_id)
            .and_then(|registry| registry.windows.get_mut(&window_id))
        {
            if geometry.maximized {
                if let Some(saved) = record.geometry.as_mut() {
                    saved.maximized = true;
                } else {
                    record.geometry = Some(geometry);
                }
            } else {
                record.geometry = Some(geometry);
            }
        }
        Ok(())
    }

    #[cfg(test)]
    fn cancel_drags_for_label(&self, label: &str) -> Result<Vec<InternalDragSession>, String> {
        let mut inner = self.lock()?;
        let Some((_, window_id)) = inner.label_index.get(label).cloned() else {
            return Ok(Vec::new());
        };
        let cancelled_ids: Vec<_> = inner
            .drags
            .iter()
            .filter(|(_, drag)| {
                drag.source_window_id == window_id
                    || drag
                        .target
                        .as_ref()
                        .is_some_and(|target| target.window_id == window_id)
            })
            .map(|(drag_id, _)| drag_id.clone())
            .collect();
        Ok(cancelled_ids
            .into_iter()
            .filter_map(|drag_id| inner.drags.remove(&drag_id))
            .collect())
    }

    pub fn advance_view_revision(
        &self,
        project_id: &str,
        window_id: &str,
        base_revision: u64,
    ) -> Result<ProjectWindowRecord, String> {
        let mut inner = self.lock()?;
        let record = inner
            .projects
            .get_mut(project_id)
            .and_then(|registry| registry.windows.get_mut(window_id))
            .ok_or("The native project window is not registered.")?;
        if record.view_revision != base_revision {
            return Err("The window view revision is stale.".into());
        }
        record.view_revision += 1;
        Ok(record.clone())
    }

    pub fn active_drags_for_registered_window(
        &self,
        project_id: &str,
        window_id: &str,
        label: &str,
    ) -> Result<Vec<InternalDragSession>, String> {
        let inner = self.lock()?;
        if !inner
            .label_index
            .get(label)
            .is_some_and(|(project, window)| project == project_id && window == window_id)
        {
            return Err("The active drag query origin is not its registered native window.".into());
        }
        if !inner.projects.contains_key(project_id) {
            return Err("The drag project has no registered windows.".into());
        }
        let mut drags: Vec<_> = inner
            .drags
            .values()
            .filter(|drag| drag.project_id == project_id)
            .cloned()
            .collect();
        drags.sort_by(|left, right| left.drag_id.cmp(&right.drag_id));
        Ok(drags)
    }

    pub fn begin_drag(
        &self,
        request: BeginInternalDragRequest,
    ) -> Result<InternalDragSession, String> {
        validate_drag_payload(&request.payload)?;
        let mut inner = self.lock()?;
        let registry = inner
            .projects
            .get(&request.project_id)
            .ok_or("The drag project has no registered windows.")?;
        let source = registry
            .windows
            .get(&request.source_window_id)
            .ok_or("The drag source window is not registered.")?;
        if source.view_revision != request.source_view_revision {
            return Err("The drag source view revision is stale.".into());
        }
        if inner.drags.values().any(|drag| {
            drag.project_id == request.project_id
                && drag.source_window_id == request.source_window_id
        }) {
            return Err("The source window already has an active internal drag.".into());
        }
        let drag = InternalDragSession {
            drag_id: collision_resistant_id("drag", &DRAG_COUNTER),
            project_id: request.project_id,
            source_window_id: request.source_window_id,
            source_view_revision: request.source_view_revision,
            session_revision: request.session_revision,
            payload: request.payload,
            effect: request.effect,
            target: None,
        };
        inner.drags.insert(drag.drag_id.clone(), drag.clone());
        Ok(drag)
    }

    pub fn preview_drag(
        &self,
        project_id: &str,
        drag_id: &str,
        target: InternalDragTarget,
    ) -> Result<InternalDragSession, String> {
        validate_drag_placement(&target.placement)?;
        let mut inner = self.lock()?;
        let registry = inner
            .projects
            .get(project_id)
            .ok_or("The drag project has no registered windows.")?;
        let destination = registry
            .windows
            .get(&target.window_id)
            .ok_or("The drag destination window is not registered.")?;
        if destination.view_revision != target.view_revision {
            return Err("The drag destination view revision is stale.".into());
        }
        let drag = inner
            .drags
            .get_mut(drag_id)
            .filter(|drag| drag.project_id == project_id)
            .ok_or("The internal drag session is no longer active.")?;
        drag.target = Some(target);
        Ok(drag.clone())
    }

    pub fn acknowledge_drag(
        &self,
        project_id: &str,
        drag_id: &str,
        destination_window_id: &str,
        current_session_revision: u64,
    ) -> Result<DragAcknowledgement, String> {
        let mut inner = self.lock()?;
        let drag = inner
            .drags
            .get(drag_id)
            .filter(|drag| drag.project_id == project_id)
            .cloned()
            .ok_or("The internal drag session is no longer active.")?;
        if drag.session_revision != current_session_revision {
            return Err("The dragged source is stale relative to project state.".into());
        }
        let target = drag
            .target
            .clone()
            .filter(|target| target.window_id == destination_window_id)
            .ok_or("The drag has no acknowledged destination preview.")?;
        let registry = inner
            .projects
            .get_mut(project_id)
            .ok_or("The drag project has no registered windows.")?;
        let source_revision = registry
            .windows
            .get(&drag.source_window_id)
            .ok_or("The drag source window disappeared.")?
            .view_revision;
        let destination_revision = registry
            .windows
            .get(destination_window_id)
            .ok_or("The drag destination window disappeared.")?
            .view_revision;
        if source_revision != drag.source_view_revision {
            return Err("The drag source view changed before acknowledgement.".into());
        }
        if destination_revision != target.view_revision {
            return Err("The drag destination view changed before acknowledgement.".into());
        }
        if drag.source_window_id == destination_window_id {
            let record = registry
                .windows
                .get_mut(destination_window_id)
                .expect("validated same-window destination exists");
            record.view_revision += 1;
        } else {
            if drag.effect == InternalDragEffect::Move {
                registry
                    .windows
                    .get_mut(&drag.source_window_id)
                    .expect("validated drag source exists")
                    .view_revision += 1;
            }
            registry
                .windows
                .get_mut(destination_window_id)
                .expect("validated drag destination exists")
                .view_revision += 1;
        }
        let acknowledgement = DragAcknowledgement {
            drag_id: drag.drag_id.clone(),
            project_id: drag.project_id,
            source_window_id: drag.source_window_id.clone(),
            destination_window_id: destination_window_id.into(),
            source_view_revision: registry
                .windows
                .get(&drag.source_window_id)
                .expect("drag source remains registered")
                .view_revision,
            destination_view_revision: registry
                .windows
                .get(destination_window_id)
                .expect("drag destination remains registered")
                .view_revision,
            payload: drag.payload,
            effect: drag.effect,
            placement: target.placement,
        };
        inner.drags.remove(drag_id);
        Ok(acknowledgement)
    }

    pub fn cancel_drag(
        &self,
        project_id: &str,
        drag_id: &str,
        requester_window_id: &str,
    ) -> Result<InternalDragSession, String> {
        let mut inner = self.lock()?;
        let drag = inner
            .drags
            .get(drag_id)
            .filter(|drag| drag.project_id == project_id)
            .cloned()
            .ok_or("The internal drag session is no longer active.")?;
        let requester_is_target = drag
            .target
            .as_ref()
            .is_some_and(|target| target.window_id == requester_window_id);
        if drag.source_window_id != requester_window_id && !requester_is_target {
            return Err("Only a drag source or current destination can cancel it.".into());
        }
        inner.drags.remove(drag_id);
        Ok(drag)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, WindowManagerInner>, String> {
        self.inner
            .lock()
            .map_err(|_| "The native window registry lock is poisoned.".into())
    }
}

impl WindowManagerInner {
    fn snapshot(&self, project_id: &str) -> Result<WindowRegistrySnapshot, String> {
        let registry = self
            .projects
            .get(project_id)
            .ok_or("The project window registry is not active.")?;
        let mut windows: Vec<_> = registry.windows.values().cloned().collect();
        windows.sort_by_key(|record| record.registration_order);
        Ok(WindowRegistrySnapshot {
            project_id: project_id.into(),
            leader_window_id: registry.leader_window_id.clone(),
            windows,
        })
    }
}

impl ProjectWindowRegistry {
    fn refresh_leader_flags(&mut self) {
        for record in self.windows.values_mut() {
            record.is_leader = record.window_id == self.leader_window_id;
        }
    }
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

fn validate_window_label(label: &str) -> Result<(), String> {
    validate_identifier("native window label", label)?;
    if label != "main" && !label.starts_with("scs-workspace-") {
        return Err(
            "Native workspace labels must be main or use the scs-workspace- prefix.".into(),
        );
    }
    Ok(())
}

fn validate_drag_payload(payload: &InternalDragPayload) -> Result<(), String> {
    match payload {
        InternalDragPayload::DocumentTab { document_id } => {
            validate_identifier("dragged document id", document_id)
        }
        InternalDragPayload::WorkspacePanel { panel_id } => {
            validate_identifier("dragged panel id", panel_id)
        }
    }
}

fn validate_drag_source(
    session: &serde_json::Value,
    payload: &InternalDragPayload,
) -> Result<(), String> {
    if let InternalDragPayload::DocumentTab { document_id } = payload {
        let documents = session
            .get("documents")
            .and_then(serde_json::Value::as_array)
            .ok_or("The authoritative session document list is malformed.")?;
        if !documents.iter().any(|document| {
            document.get("id").and_then(serde_json::Value::as_str) == Some(document_id.as_str())
        }) {
            return Err("The dragged screenplay document no longer exists.".into());
        }
    }
    Ok(())
}

fn validate_drag_placement(placement: &InternalDragPlacement) -> Result<(), String> {
    if let InternalDragPlacement::DockGroup { group_id, .. } = placement {
        validate_identifier("dock group id", group_id)?;
    }
    Ok(())
}

fn collision_resistant_id(prefix: &str, counter: &AtomicU64) -> String {
    let count = counter.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    format!("{prefix}-{:x}-{timestamp:x}-{count:x}", std::process::id())
}

fn next_window_identity<R: Runtime>(app: &AppHandle<R>) -> (String, String) {
    loop {
        let window_id = collision_resistant_id("window", &WINDOW_COUNTER);
        let label = window_id.replacen("window-", "scs-workspace-", 1);
        if app.get_webview_window(&label).is_none() {
            return (window_id, label);
        }
    }
}

pub fn clamp_geometry(geometry: WindowGeometry, monitors: &[MonitorBounds]) -> WindowGeometry {
    let fallback = MonitorBounds {
        x: 0,
        y: 0,
        width: 1440,
        height: 880,
    };
    let monitors = if monitors.is_empty() {
        std::slice::from_ref(&fallback)
    } else {
        monitors
    };
    let best_monitor = monitors
        .iter()
        .max_by_key(|monitor| intersection_area(geometry, **monitor));
    let was_visible = best_monitor.is_some_and(|monitor| intersection_area(geometry, *monitor) > 0);
    let monitor = best_monitor.filter(|_| was_visible).unwrap_or(&monitors[0]);
    let minimum_width = MIN_WINDOW_WIDTH.min(monitor.width.max(320));
    let minimum_height = MIN_WINDOW_HEIGHT.min(monitor.height.max(240));
    let width = geometry
        .width
        .clamp(minimum_width, monitor.width.max(minimum_width));
    let height = geometry
        .height
        .clamp(minimum_height, monitor.height.max(minimum_height));
    let maximum_x = monitor
        .x
        .saturating_add(monitor.width.saturating_sub(width) as i32);
    let maximum_y = monitor
        .y
        .saturating_add(monitor.height.saturating_sub(height) as i32);
    WindowGeometry {
        x: if was_visible {
            geometry.x.clamp(monitor.x, maximum_x)
        } else {
            monitor.x + monitor.width.saturating_sub(width) as i32 / 2
        },
        y: if was_visible {
            geometry.y.clamp(monitor.y, maximum_y)
        } else {
            monitor.y + monitor.height.saturating_sub(height) as i32 / 2
        },
        width,
        height,
        maximized: geometry.maximized,
    }
}

fn intersection_area(window: WindowGeometry, monitor: MonitorBounds) -> u64 {
    let left = i64::from(window.x).max(i64::from(monitor.x));
    let top = i64::from(window.y).max(i64::from(monitor.y));
    let right = (i64::from(window.x) + i64::from(window.width))
        .min(i64::from(monitor.x) + i64::from(monitor.width));
    let bottom = (i64::from(window.y) + i64::from(window.height))
        .min(i64::from(monitor.y) + i64::from(monitor.height));
    right.saturating_sub(left).max(0) as u64 * bottom.saturating_sub(top).max(0) as u64
}

fn monitor_bounds<R: Runtime>(app: &AppHandle<R>) -> Vec<MonitorBounds> {
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| MonitorBounds {
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
        })
        .collect()
}

fn restore_geometry<R: Runtime>(window: &WebviewWindow<R>, geometry: WindowGeometry) {
    let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
    let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));
    if geometry.maximized {
        let _ = window.maximize();
    }
}

fn emit_registry<R: Runtime>(app: &AppHandle<R>, snapshot: &WindowRegistrySnapshot) {
    for record in &snapshot.windows {
        let _ = app.emit_to(&record.label, REGISTRY_EVENT, snapshot);
    }
}

fn emit_drag<R: Runtime, T: Serialize + Clone>(
    app: &AppHandle<R>,
    state: &WindowManagerState,
    project_id: &str,
    event: &str,
    payload: T,
) {
    if let Ok(labels) = state.labels_for_project(project_id) {
        for label in labels {
            let _ = app.emit_to(&label, event, payload.clone());
        }
    }
}

fn finish_window_unregistration<R: Runtime>(
    app: &AppHandle<R>,
    state: &WindowManagerState,
    coordinator: &SessionCoordinatorState,
    unregistration: &WindowUnregistration,
) -> Result<bool, String> {
    coordinator.abandon_save_owner(
        &unregistration.record.project_id,
        &unregistration.record.window_id,
    )?;
    let released_session = if unregistration.snapshot.is_none() {
        coordinator.release_project(&unregistration.record.project_id)?
    } else {
        false
    };
    if let Some(snapshot) = &unregistration.snapshot {
        emit_registry(app, snapshot);
    }
    for drag in &unregistration.cancelled_drags {
        emit_drag(
            app,
            state,
            &drag.project_id,
            DRAG_CANCELLED_EVENT,
            drag.clone(),
        );
    }
    Ok(released_session)
}

#[tauri::command(rename_all = "camelCase")]
pub fn register_workspace_window(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
    window_id: Option<String>,
    slot_id: Option<String>,
) -> Result<WindowRegistrySnapshot, String> {
    let window_id = window_id.unwrap_or_else(|| collision_resistant_id("window", &WINDOW_COUNTER));
    let slot_id = slot_id.unwrap_or_else(|| window_id.clone());
    let snapshot = state.register(project_id, window_id, window.label().into(), slot_id)?;
    emit_registry(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_workspace_windows(
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
) -> Result<WindowRegistrySnapshot, String> {
    if !state.authorizes_project(&project_id, window.label())? {
        return Err("Only a registered project window can list its native windows.".into());
    }
    state.snapshot(&project_id)
}

#[tauri::command(rename_all = "camelCase")]
// Tauri requires window creation from an async command on Windows. Calling
// `WebviewWindowBuilder::build` from a synchronous command deadlocks the event loop.
pub async fn create_workspace_window(
    app: AppHandle,
    caller: WebviewWindow,
    state: State<'_, WindowManagerState>,
    coordinator: State<'_, SessionCoordinatorState>,
    request: CreateWorkspaceWindowRequest,
) -> Result<ProjectWindowRecord, String> {
    let caller_registered = state
        .lock()?
        .label_index
        .get(caller.label())
        .is_some_and(|(project_id, _)| project_id == &request.project_id);
    if !caller_registered {
        return Err("Only a registered project window can create a secondary window.".into());
    }
    validate_identifier("session id", &request.session_id)?;
    coordinator.revision(&request.project_id, &request.session_id)?;
    validate_identifier("window slot id", &request.slot_id)?;
    let (window_id, label) = next_window_identity(&app);
    let snapshot = state.register(
        request.project_id.clone(),
        window_id.clone(),
        label.clone(),
        request.slot_id.clone(),
    )?;
    let url = format!(
        "index.html?scsProjectId={}&scsSessionId={}&scsWindowId={}&scsSlotId={}",
        request.project_id, request.session_id, window_id, request.slot_id
    );
    let build = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("Script Control Software")
        .inner_size(1200.0, 760.0)
        .min_inner_size(MIN_WINDOW_WIDTH as f64, MIN_WINDOW_HEIGHT as f64)
        .prevent_overflow()
        .disable_drag_drop_handler()
        .visible(false)
        .build();
    let created = match build {
        Ok(window) => window,
        Err(error) => {
            let _ = state.unregister_by_label(&label);
            return Err(format!(
                "Secondary workspace window could not be created: {error}"
            ));
        }
    };
    if let Some(geometry) = request.geometry {
        restore_geometry(&created, clamp_geometry(geometry, &monitor_bounds(&app)));
    } else {
        let _ = created.center();
    }
    if let Err(error) = created.show() {
        let _ = created.destroy();
        let _ = state.unregister_by_label(&label);
        return Err(format!(
            "Secondary workspace window could not be shown: {error}"
        ));
    }
    let _ = created.set_focus();
    emit_registry(&app, &snapshot);
    state.record_for_window(&request.project_id, &window_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn focus_workspace_window(
    app: AppHandle,
    caller: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
    window_id: String,
) -> Result<(), String> {
    let caller_allowed = state
        .lock()?
        .label_index
        .get(caller.label())
        .is_some_and(|(project, _)| project == &project_id);
    if !caller_allowed {
        return Err("Only a window in this project can focus another project window.".into());
    }
    let record = state.record_for_window(&project_id, &window_id)?;
    let target = app
        .get_webview_window(&record.label)
        .ok_or("The native project window no longer exists.")?;
    let _ = target.unminimize();
    target
        .show()
        .and_then(|_| target.set_focus())
        .map_err(|error| format!("The native project window could not be focused: {error}"))
}

#[tauri::command(rename_all = "camelCase")]
pub fn bring_all_workspace_windows_to_front(
    app: AppHandle,
    caller: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
) -> Result<(), String> {
    let snapshot = state.snapshot(&project_id)?;
    if !snapshot
        .windows
        .iter()
        .any(|record| record.label == caller.label())
    {
        return Err("Only a window in this project can bring its windows forward.".into());
    }
    for record in snapshot.windows {
        if let Some(window) = app.get_webview_window(&record.label) {
            let _ = window.unminimize();
            let _ = window.show();
        }
    }
    let _ = caller.unminimize();
    caller
        .show()
        .and_then(|_| caller.set_focus())
        .map_err(|error| format!("The requesting native window could not be focused: {error}"))
}

#[tauri::command(rename_all = "camelCase")]
pub fn reset_workspace_window_placement(
    app: AppHandle,
    caller: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
    window_id: String,
) -> Result<(), String> {
    let caller_allowed = state
        .lock()?
        .label_index
        .get(caller.label())
        .is_some_and(|(project, _)| project == &project_id);
    if !caller_allowed {
        return Err("Only a window in this project can reset project window placement.".into());
    }
    let record = state.record_for_window(&project_id, &window_id)?;
    let target = app
        .get_webview_window(&record.label)
        .ok_or("The native project window no longer exists.")?;
    let _ = target.unmaximize();
    let _ = target.set_size(PhysicalSize::new(1200, 760));
    target
        .center()
        .map_err(|error| format!("The native project window could not be centered: {error}"))
}

#[tauri::command(rename_all = "camelCase")]
pub fn leave_workspace_project(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    coordinator: State<'_, SessionCoordinatorState>,
    allow_final_window: bool,
) -> Result<LeaveWorkspaceResult, String> {
    let disposition = state
        .close_disposition_for_label(window.label())?
        .ok_or("The native project window is not registered.")?;
    if disposition.kind == CloseDispositionKind::FinalWindow && !allow_final_window {
        return Err(
            "Leaving the final project view requires explicit save/recovery confirmation.".into(),
        );
    }
    let unregistration = state
        .unregister_window_by_label(window.label())?
        .ok_or("The native project window is not registered.")?;
    let released_session =
        finish_window_unregistration(&app, &state, &coordinator, &unregistration)?;
    Ok(LeaveWorkspaceResult {
        project_id: unregistration.record.project_id.clone(),
        window_id: unregistration.record.window_id.clone(),
        remaining_window_count: unregistration
            .snapshot
            .as_ref()
            .map_or(0, |snapshot| snapshot.windows.len()),
        leader_window_id: unregistration
            .snapshot
            .map(|snapshot| snapshot.leader_window_id),
        released_session,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn request_close_workspace_window(
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
) -> Result<CloseDisposition, String> {
    state
        .close_disposition_for_label(window.label())?
        .ok_or_else(|| "The native project window is not registered.".into())
}

#[tauri::command(rename_all = "camelCase")]
pub fn confirm_close_workspace_window(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    coordinator: State<'_, SessionCoordinatorState>,
    allow_final_window: bool,
) -> Result<(), String> {
    let disposition = state
        .close_disposition_for_label(window.label())?
        .ok_or("The native project window is not registered.")?;
    if disposition.kind == CloseDispositionKind::FinalWindow && !allow_final_window {
        return Err(
            "The final project window requires explicit save/recovery confirmation.".into(),
        );
    }
    let label = window.label().to_string();
    window
        .destroy()
        .map_err(|error| format!("The native project window could not be closed: {error}"))?;
    if let Some(unregistration) = state.unregister_window_by_label(&label)? {
        finish_window_unregistration(&app, &state, &coordinator, &unregistration)?;
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn advance_workspace_view_revision(
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
    window_id: String,
    base_revision: u64,
) -> Result<ProjectWindowRecord, String> {
    if !state.authorizes(&project_id, &window_id, window.label())? {
        return Err("The view revision origin is not its registered native window.".into());
    }
    state.advance_view_revision(&project_id, &window_id, base_revision)
}

#[tauri::command(rename_all = "camelCase")]
pub fn begin_internal_drag(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, WindowManagerState>,
    coordinator: State<'_, SessionCoordinatorState>,
    request: BeginInternalDragRequest,
) -> Result<InternalDragSession, String> {
    if !windows.authorizes(
        &request.project_id,
        &request.source_window_id,
        window.label(),
    )? {
        return Err("The drag origin is not its registered native window.".into());
    }
    let snapshot = coordinator.snapshot_for_project(&request.project_id)?;
    if snapshot.revision != request.session_revision {
        return Err("The drag source project revision is stale.".into());
    }
    validate_drag_source(&snapshot.session, &request.payload)?;
    let drag = windows.begin_drag(request)?;
    emit_drag(&app, &windows, &drag.project_id, DRAG_PREVIEW_EVENT, &drag);
    Ok(drag)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_active_internal_drags(
    window: WebviewWindow,
    windows: State<'_, WindowManagerState>,
    coordinator: State<'_, SessionCoordinatorState>,
    project_id: String,
    session_id: String,
    window_id: String,
) -> Result<Vec<InternalDragSession>, String> {
    coordinator.revision(&project_id, &session_id)?;
    windows.active_drags_for_registered_window(&project_id, &window_id, window.label())
}

#[tauri::command(rename_all = "camelCase")]
pub fn preview_internal_drag(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
    drag_id: String,
    target: InternalDragTarget,
) -> Result<InternalDragSession, String> {
    if !state.authorizes(&project_id, &target.window_id, window.label())? {
        return Err("The drag preview origin is not its registered destination window.".into());
    }
    let drag = state.preview_drag(&project_id, &drag_id, target)?;
    emit_drag(&app, &state, &project_id, DRAG_PREVIEW_EVENT, &drag);
    Ok(drag)
}

#[tauri::command(rename_all = "camelCase")]
pub fn acknowledge_internal_drag(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, WindowManagerState>,
    coordinator: State<'_, SessionCoordinatorState>,
    request: AcknowledgeInternalDragRequest,
) -> Result<DragAcknowledgement, String> {
    if !windows.authorizes(
        &request.project_id,
        &request.destination_window_id,
        window.label(),
    )? {
        return Err("The drag acknowledgement origin is not its destination window.".into());
    }
    let revision = coordinator.revision(&request.project_id, &request.session_id)?;
    let acknowledgement = windows.acknowledge_drag(
        &request.project_id,
        &request.drag_id,
        &request.destination_window_id,
        revision,
    )?;
    emit_drag(
        &app,
        &windows,
        &request.project_id,
        DRAG_ACKNOWLEDGED_EVENT,
        &acknowledgement,
    );
    Ok(acknowledgement)
}

#[tauri::command(rename_all = "camelCase")]
pub fn cancel_internal_drag(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, WindowManagerState>,
    project_id: String,
    drag_id: String,
    requester_window_id: String,
) -> Result<InternalDragSession, String> {
    if !state.authorizes(&project_id, &requester_window_id, window.label())? {
        return Err("The drag cancellation origin is not its registered native window.".into());
    }
    let drag = state.cancel_drag(&project_id, &drag_id, &requester_window_id)?;
    emit_drag(&app, &state, &project_id, DRAG_CANCELLED_EVENT, &drag);
    Ok(drag)
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let app = window.app_handle();
    let state = app.state::<WindowManagerState>();
    let coordinator = app.state::<SessionCoordinatorState>();
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if state.contains_label(window.label()).unwrap_or(false) {
                api.prevent_close();
                if let Ok(Some(disposition)) = state.close_disposition_for_label(window.label()) {
                    let _ = app.emit_to(window.label(), CLOSE_REQUESTED_EVENT, disposition);
                }
            }
        }
        WindowEvent::Destroyed => {
            if let Ok(Some(unregistration)) = state.unregister_window_by_label(window.label()) {
                let _ = finish_window_unregistration(app, &state, &coordinator, &unregistration);
            }
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if !state.contains_label(window.label()).unwrap_or(false) {
                return;
            }
            if let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) {
                let geometry = WindowGeometry {
                    x: position.x,
                    y: position.y,
                    width: size.width,
                    height: size.height,
                    maximized: window.is_maximized().unwrap_or(false),
                };
                let _ = state.update_geometry_by_label(window.label(), geometry);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn register_three(state: &WindowManagerState) {
        state
            .register(
                "project-test".into(),
                "window-main".into(),
                "main".into(),
                "slot-main".into(),
            )
            .unwrap();
        state
            .register(
                "project-test".into(),
                "window-two".into(),
                "scs-workspace-two".into(),
                "slot-two".into(),
            )
            .unwrap();
        state
            .register(
                "project-test".into(),
                "window-three".into(),
                "scs-workspace-three".into(),
                "slot-three".into(),
            )
            .unwrap();
    }

    #[test]
    fn registration_is_namespaced_and_labels_cannot_collide() {
        let state = WindowManagerState::default();
        register_three(&state);
        let snapshot = state.snapshot("project-test").unwrap();
        assert_eq!(snapshot.leader_window_id, "window-main");
        assert_eq!(snapshot.windows.len(), 3);
        assert!(snapshot.windows[0].is_leader);
        assert!(state
            .register(
                "project-other".into(),
                "other".into(),
                "main".into(),
                "other-slot".into()
            )
            .is_err());
        assert!(state
            .register(
                "project-test".into(),
                "window-four".into(),
                "scs-workspace-four".into(),
                "slot-two".into()
            )
            .is_err());
    }

    #[test]
    fn launcher_window_can_leave_and_register_a_different_project() {
        let state = WindowManagerState::default();
        state
            .register(
                "project-one".into(),
                "window-main".into(),
                "main".into(),
                "slot-one".into(),
            )
            .unwrap();
        assert!(state.unregister_by_label("main").unwrap().is_none());
        let snapshot = state
            .register(
                "project-two".into(),
                "window-main-two".into(),
                "main".into(),
                "slot-two".into(),
            )
            .unwrap();
        assert_eq!(snapshot.project_id, "project-two");
        assert_eq!(snapshot.leader_window_id, "window-main-two");
    }

    #[test]
    fn leader_close_promotes_the_oldest_surviving_window() {
        let state = WindowManagerState::default();
        register_three(&state);
        let disposition = state.close_disposition_for_label("main").unwrap().unwrap();
        assert_eq!(disposition.kind, CloseDispositionKind::PromoteLeader);
        assert_eq!(
            disposition.next_leader_window_id.as_deref(),
            Some("window-two")
        );
        let snapshot = state.unregister_by_label("main").unwrap().unwrap();
        assert_eq!(snapshot.leader_window_id, "window-two");
        assert!(snapshot.windows[0].is_leader);
        state.unregister_by_label("scs-workspace-two").unwrap();
        let final_disposition = state
            .close_disposition_for_label("scs-workspace-three")
            .unwrap()
            .unwrap();
        assert_eq!(final_disposition.kind, CloseDispositionKind::FinalWindow);
    }

    #[test]
    fn duplicate_destroy_finalization_cannot_misclassify_surviving_windows_as_final() {
        let state = WindowManagerState::default();
        register_three(&state);
        let first = state
            .unregister_window_by_label("main")
            .unwrap()
            .expect("the first destroy path owns finalization");
        let snapshot = first
            .snapshot
            .expect("the project still has secondary windows");
        assert_eq!(snapshot.windows.len(), 2);
        assert_eq!(snapshot.leader_window_id, "window-two");

        assert!(state.unregister_window_by_label("main").unwrap().is_none());
        let surviving = state.snapshot("project-test").unwrap();
        assert_eq!(surviving.windows.len(), 2);
        assert_eq!(surviving.leader_window_id, "window-two");
    }

    #[test]
    fn view_revisions_are_compare_and_swap_values() {
        let state = WindowManagerState::default();
        register_three(&state);
        let advanced = state
            .advance_view_revision("project-test", "window-two", 0)
            .unwrap();
        assert_eq!(advanced.view_revision, 1);
        assert!(state
            .advance_view_revision("project-test", "window-two", 0)
            .is_err());
    }

    #[test]
    fn drag_move_only_commits_after_destination_acknowledgement() {
        let state = WindowManagerState::default();
        register_three(&state);
        let drag = state
            .begin_drag(BeginInternalDragRequest {
                project_id: "project-test".into(),
                source_window_id: "window-main".into(),
                source_view_revision: 0,
                session_revision: 7,
                payload: InternalDragPayload::DocumentTab {
                    document_id: "doc-1".into(),
                },
                effect: InternalDragEffect::Move,
            })
            .unwrap();
        assert_eq!(
            state
                .record_for_window("project-test", "window-main")
                .unwrap()
                .view_revision,
            0
        );
        state
            .preview_drag(
                "project-test",
                &drag.drag_id,
                InternalDragTarget {
                    window_id: "window-two".into(),
                    view_revision: 0,
                    placement: InternalDragPlacement::DocumentTabs { index: 1 },
                },
            )
            .unwrap();
        let acknowledgement = state
            .acknowledge_drag("project-test", &drag.drag_id, "window-two", 7)
            .unwrap();
        assert_eq!(acknowledgement.source_view_revision, 1);
        assert_eq!(acknowledgement.destination_view_revision, 1);
        assert!(state
            .acknowledge_drag("project-test", &drag.drag_id, "window-two", 7)
            .is_err());
    }

    #[test]
    fn newly_registered_window_can_query_an_active_drag_until_it_settles() {
        let state = WindowManagerState::default();
        state
            .register(
                "project-test".into(),
                "window-main".into(),
                "main".into(),
                "slot-main".into(),
            )
            .unwrap();
        let drag = state
            .begin_drag(BeginInternalDragRequest {
                project_id: "project-test".into(),
                source_window_id: "window-main".into(),
                source_view_revision: 0,
                session_revision: 7,
                payload: InternalDragPayload::DocumentTab {
                    document_id: "doc-1".into(),
                },
                effect: InternalDragEffect::Move,
            })
            .unwrap();

        assert!(
            state
                .active_drags_for_registered_window(
                    "project-test",
                    "window-late",
                    "scs-workspace-late",
                )
                .is_err()
        );
        state
            .register(
                "project-test".into(),
                "window-late".into(),
                "scs-workspace-late".into(),
                "slot-late".into(),
            )
            .unwrap();
        assert_eq!(
            state
                .active_drags_for_registered_window(
                    "project-test",
                    "window-late",
                    "scs-workspace-late",
                )
                .unwrap(),
            vec![drag.clone()]
        );
        assert!(
            state
                .active_drags_for_registered_window(
                    "project-test",
                    "window-main",
                    "scs-workspace-late",
                )
                .is_err()
        );

        state
            .cancel_drag("project-test", &drag.drag_id, "window-main")
            .unwrap();
        assert!(
            state
                .active_drags_for_registered_window(
                    "project-test",
                    "window-late",
                    "scs-workspace-late",
                )
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn destination_close_cancels_drag_without_advancing_the_source() {
        let state = WindowManagerState::default();
        register_three(&state);
        let drag = state
            .begin_drag(BeginInternalDragRequest {
                project_id: "project-test".into(),
                source_window_id: "window-main".into(),
                source_view_revision: 0,
                session_revision: 1,
                payload: InternalDragPayload::WorkspacePanel {
                    panel_id: "breakdown".into(),
                },
                effect: InternalDragEffect::Move,
            })
            .unwrap();
        state
            .preview_drag(
                "project-test",
                &drag.drag_id,
                InternalDragTarget {
                    window_id: "window-two".into(),
                    view_revision: 0,
                    placement: InternalDragPlacement::DockGroup {
                        group_id: "main-tabs".into(),
                        edge: DockEdge::Right,
                    },
                },
            )
            .unwrap();
        let cancelled = state.cancel_drags_for_label("scs-workspace-two").unwrap();
        assert_eq!(cancelled.len(), 1);
        assert_eq!(cancelled[0].drag_id, drag.drag_id);
        state.unregister_by_label("scs-workspace-two").unwrap();
        assert!(state
            .acknowledge_drag("project-test", &drag.drag_id, "window-two", 1)
            .is_err());
        assert_eq!(
            state
                .record_for_window("project-test", "window-main")
                .unwrap()
                .view_revision,
            0
        );
    }

    #[test]
    fn same_window_copy_acknowledgement_advances_the_view_once() {
        let state = WindowManagerState::default();
        register_three(&state);
        let drag = state
            .begin_drag(BeginInternalDragRequest {
                project_id: "project-test".into(),
                source_window_id: "window-two".into(),
                source_view_revision: 0,
                session_revision: 4,
                payload: InternalDragPayload::WorkspacePanel {
                    panel_id: "production".into(),
                },
                effect: InternalDragEffect::Copy,
            })
            .unwrap();
        state
            .preview_drag(
                "project-test",
                &drag.drag_id,
                InternalDragTarget {
                    window_id: "window-two".into(),
                    view_revision: 0,
                    placement: InternalDragPlacement::DockGroup {
                        group_id: "main-tabs".into(),
                        edge: DockEdge::Center,
                    },
                },
            )
            .unwrap();
        let acknowledgement = state
            .acknowledge_drag("project-test", &drag.drag_id, "window-two", 4)
            .unwrap();
        assert_eq!(acknowledgement.effect, InternalDragEffect::Copy);
        assert_eq!(acknowledgement.source_view_revision, 1);
        assert_eq!(acknowledgement.destination_view_revision, 1);
        assert_eq!(
            state
                .record_for_window("project-test", "window-two")
                .unwrap()
                .view_revision,
            1
        );
    }

    #[test]
    fn cross_window_copy_only_advances_the_destination_view() {
        let state = WindowManagerState::default();
        register_three(&state);
        let drag = state
            .begin_drag(BeginInternalDragRequest {
                project_id: "project-test".into(),
                source_window_id: "window-main".into(),
                source_view_revision: 0,
                session_revision: 4,
                payload: InternalDragPayload::WorkspacePanel {
                    panel_id: "breakdown".into(),
                },
                effect: InternalDragEffect::Copy,
            })
            .unwrap();
        state
            .preview_drag(
                "project-test",
                &drag.drag_id,
                InternalDragTarget {
                    window_id: "window-two".into(),
                    view_revision: 0,
                    placement: InternalDragPlacement::DockGroup {
                        group_id: "main-tabs".into(),
                        edge: DockEdge::Right,
                    },
                },
            )
            .unwrap();
        let acknowledgement = state
            .acknowledge_drag("project-test", &drag.drag_id, "window-two", 4)
            .unwrap();
        assert_eq!(acknowledgement.source_view_revision, 0);
        assert_eq!(acknowledgement.destination_view_revision, 1);
    }

    #[test]
    fn stale_source_view_rejects_drag_without_changing_the_destination() {
        let state = WindowManagerState::default();
        register_three(&state);
        let drag = state
            .begin_drag(BeginInternalDragRequest {
                project_id: "project-test".into(),
                source_window_id: "window-main".into(),
                source_view_revision: 0,
                session_revision: 2,
                payload: InternalDragPayload::DocumentTab {
                    document_id: "doc-1".into(),
                },
                effect: InternalDragEffect::Move,
            })
            .unwrap();
        state
            .preview_drag(
                "project-test",
                &drag.drag_id,
                InternalDragTarget {
                    window_id: "window-two".into(),
                    view_revision: 0,
                    placement: InternalDragPlacement::DocumentTabs { index: 0 },
                },
            )
            .unwrap();
        state
            .advance_view_revision("project-test", "window-main", 0)
            .unwrap();
        assert!(state
            .acknowledge_drag("project-test", &drag.drag_id, "window-two", 2)
            .is_err());
        assert_eq!(
            state
                .record_for_window("project-test", "window-two")
                .unwrap()
                .view_revision,
            0
        );
    }

    #[test]
    fn geometry_is_clamped_to_a_connected_monitor_and_minimum_size() {
        let monitors = [
            MonitorBounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            MonitorBounds {
                x: 1920,
                y: 0,
                width: 1280,
                height: 1024,
            },
        ];
        let restored = clamp_geometry(
            WindowGeometry {
                x: 5000,
                y: 5000,
                width: 100,
                height: 100,
                maximized: false,
            },
            &monitors,
        );
        assert_eq!(restored.x, 470);
        assert_eq!(restored.y, 230);
        assert_eq!(restored.width, MIN_WINDOW_WIDTH);
        assert_eq!(restored.height, MIN_WINDOW_HEIGHT);
        let second = clamp_geometry(
            WindowGeometry {
                x: 2000,
                y: 100,
                width: 1100,
                height: 800,
                maximized: false,
            },
            &monitors,
        );
        assert!(second.x >= 1920);
        assert!(second.x + second.width as i32 <= 3200);
    }

    #[test]
    fn generated_window_labels_are_collision_resistant_and_capability_safe() {
        let first = collision_resistant_id("window", &WINDOW_COUNTER).replacen(
            "window-",
            "scs-workspace-",
            1,
        );
        let second = collision_resistant_id("window", &WINDOW_COUNTER).replacen(
            "window-",
            "scs-workspace-",
            1,
        );
        assert_ne!(first, second);
        assert!(first.starts_with("scs-workspace-"));
        assert!(first
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-'));
    }
}
