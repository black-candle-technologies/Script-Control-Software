import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { ProjectSession } from "../domain/projectWorkspace.ts";
import type {
  AcceptedSessionMutation,
  SessionMutationEnvelope,
} from "../domain/sessionCoordinator.ts";

export const NATIVE_WORKSPACE_EVENTS = {
  sessionRevision: "scs://session-revision",
  windowRegistry: "scs://window-registry",
  windowCloseRequested: "scs://window-close-requested",
  dragPreview: "scs://drag-preview",
  dragAcknowledged: "scs://drag-acknowledged",
  dragCancelled: "scs://drag-cancelled",
} as const;

export interface CoordinatorSnapshot {
  projectId: string;
  sessionId: string;
  revision: number;
  session: ProjectSession;
  resourceRevisions: Record<string, number>;
}

export type NativeMutationDisposition =
  | "accepted"
  | "reconciled"
  | "duplicate"
  | "rejected"
  | "resync";

export type NativeMutationRejectionReason =
  | "wrong-project"
  | "wrong-session"
  | "wrong-origin"
  | "permission"
  | "invalid-envelope"
  | "future-revision"
  | "history-gap"
  | "stale-conflict"
  | "invalid-mutation";

export interface NativeMutationResult {
  disposition: NativeMutationDisposition;
  revision: number;
  accepted: AcceptedSessionMutation | null;
  reason: NativeMutationRejectionReason | null;
  message: string | null;
  snapshot: CoordinatorSnapshot | null;
}

const NATIVE_MUTATION_REJECTION_REASONS: readonly NativeMutationRejectionReason[] = [
  "wrong-project",
  "wrong-session",
  "wrong-origin",
  "permission",
  "invalid-envelope",
  "future-revision",
  "history-gap",
  "stale-conflict",
  "invalid-mutation",
];

/** Converts only the coordinator's bounded, known rejection fields into user-visible text. */
export function nativeMutationFailureMessage(result: NativeMutationResult): string | null {
  if (["accepted", "reconciled", "duplicate"].includes(result.disposition)) return null;
  if (result.disposition !== "rejected" && result.disposition !== "resync") {
    return "The native coordinator returned an invalid mutation result.";
  }
  const reason = NATIVE_MUTATION_REJECTION_REASONS.includes(result.reason as NativeMutationRejectionReason)
    ? result.reason
    : null;
  const message = validatedNativeMutationMessage(result.message);
  const action = result.disposition === "resync" ? "required a resync for" : "rejected";
  if (!reason || !message) {
    return `The native coordinator ${action} the mutation without a valid reason.`;
  }
  return `The native coordinator ${action} the mutation (${reason}): ${message}`;
}

function validatedNativeMutationMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message || message.length > 500 || /[\u0000-\u001f\u007f]/.test(message)) return null;
  return message;
}

export type SaveKind = "recovery" | "portable";
export type SaveIntentDisposition = "start" | "queued" | "already-covered";

export interface SaveIntent {
  intentId: string;
  projectId: string;
  sessionId: string;
  revision: number;
  kind: SaveKind;
}

export interface SaveIntentResult {
  disposition: SaveIntentDisposition;
  intent: SaveIntent;
}

export interface SaveCompletionResult {
  next: SaveIntent | null;
  lastRecoveryRevision: number | null;
  lastPortableRevision: number | null;
  dirty: boolean;
}

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface ProjectWindowRecord {
  windowId: string;
  label: string;
  projectId: string;
  slotId: string;
  registrationOrder: number;
  viewRevision: number;
  isLeader: boolean;
  geometry: WindowGeometry | null;
}

export interface WindowRegistrySnapshot {
  projectId: string;
  leaderWindowId: string;
  windows: ProjectWindowRecord[];
}

export interface CreateWorkspaceWindowRequest {
  projectId: string;
  sessionId: string;
  slotId: string;
  geometry?: WindowGeometry;
}

export type CloseDispositionKind = "secondary" | "promote-leader" | "final-window";

export interface CloseDisposition {
  kind: CloseDispositionKind;
  windowId: string;
  nextLeaderWindowId: string | null;
}

export interface LeaveWorkspaceResult {
  projectId: string;
  windowId: string;
  remainingWindowCount: number;
  leaderWindowId: string | null;
  releasedSession: boolean;
}

export type InternalDragPayload =
  | { kind: "document-tab"; documentId: string }
  | { kind: "workspace-panel"; panelId: string };

export type InternalDragEffect = "move" | "copy";
export type DockEdge = "center" | "left" | "right" | "top" | "bottom";

export type InternalDragPlacement =
  | { kind: "document-tabs"; index: number }
  | { kind: "dock-group"; groupId: string; edge: DockEdge }
  | { kind: "floating-layer" };

export interface InternalDragTarget {
  windowId: string;
  viewRevision: number;
  placement: InternalDragPlacement;
}

export interface BeginInternalDragRequest {
  projectId: string;
  sourceWindowId: string;
  sourceViewRevision: number;
  sessionRevision: number;
  payload: InternalDragPayload;
  effect: InternalDragEffect;
}

export interface InternalDragSession extends BeginInternalDragRequest {
  dragId: string;
  target: InternalDragTarget | null;
}

export interface DragAcknowledgement {
  dragId: string;
  projectId: string;
  sourceWindowId: string;
  destinationWindowId: string;
  sourceViewRevision: number;
  destinationViewRevision: number;
  payload: InternalDragPayload;
  effect: InternalDragEffect;
  placement: InternalDragPlacement;
}

export interface AcknowledgeInternalDragRequest {
  projectId: string;
  sessionId: string;
  dragId: string;
  destinationWindowId: string;
}

export const registerCoordinatedSession = (sessionId: string, session: ProjectSession) =>
  invoke<CoordinatorSnapshot>("register_coordinated_session", { sessionId, session });

export const getCoordinatorSnapshot = (projectId: string, sessionId: string) =>
  invoke<CoordinatorSnapshot>("coordinator_snapshot", { projectId, sessionId });

export const submitNativeMutation = (envelope: SessionMutationEnvelope) =>
  invoke<NativeMutationResult>("submit_coordinated_mutation", { envelope });

export const requestCoordinatedSave = (
  projectId: string,
  sessionId: string,
  revision: number,
  kind: SaveKind,
) => invoke<SaveIntentResult>("request_coordinated_save", { projectId, sessionId, revision, kind });

export const completeCoordinatedSave = (
  projectId: string,
  sessionId: string,
  intentId: string,
  success: boolean,
) => invoke<SaveCompletionResult>("complete_coordinated_save", {
  projectId,
  sessionId,
  intentId,
  success,
});

export const registerWorkspaceWindow = (
  projectId: string,
  options: { windowId?: string; slotId?: string } = {},
) => invoke<WindowRegistrySnapshot>("register_workspace_window", {
  projectId,
  windowId: options.windowId,
  slotId: options.slotId,
});

export const listWorkspaceWindows = (projectId: string) =>
  invoke<WindowRegistrySnapshot>("list_workspace_windows", { projectId });

export const createWorkspaceWindow = (request: CreateWorkspaceWindowRequest) =>
  invoke<ProjectWindowRecord>("create_workspace_window", { request });

export const focusWorkspaceWindow = (projectId: string, windowId: string) =>
  invoke<void>("focus_workspace_window", { projectId, windowId });

export const bringAllWorkspaceWindowsToFront = (projectId: string) =>
  invoke<void>("bring_all_workspace_windows_to_front", { projectId });

export const resetWorkspaceWindowPlacement = (projectId: string, windowId: string) =>
  invoke<void>("reset_workspace_window_placement", { projectId, windowId });

export const leaveWorkspaceProject = (allowFinalWindow: boolean) =>
  invoke<LeaveWorkspaceResult>("leave_workspace_project", { allowFinalWindow });

export const requestCloseWorkspaceWindow = () =>
  invoke<CloseDisposition>("request_close_workspace_window");

export const confirmCloseWorkspaceWindow = (allowFinalWindow: boolean) =>
  invoke<void>("confirm_close_workspace_window", { allowFinalWindow });

export const advanceWorkspaceViewRevision = (
  projectId: string,
  windowId: string,
  baseRevision: number,
) => invoke<ProjectWindowRecord>("advance_workspace_view_revision", {
  projectId,
  windowId,
  baseRevision,
});

export const beginInternalDrag = (request: BeginInternalDragRequest) =>
  invoke<InternalDragSession>("begin_internal_drag", { request });

export const listActiveInternalDrags = (
  projectId: string,
  sessionId: string,
  windowId: string,
) => invoke<InternalDragSession[]>("list_active_internal_drags", { projectId, sessionId, windowId });

export const previewInternalDrag = (
  projectId: string,
  dragId: string,
  target: InternalDragTarget,
) => invoke<InternalDragSession>("preview_internal_drag", { projectId, dragId, target });

export const acknowledgeInternalDrag = (request: AcknowledgeInternalDragRequest) =>
  invoke<DragAcknowledgement>("acknowledge_internal_drag", { request });

export const cancelInternalDrag = (
  projectId: string,
  dragId: string,
  requesterWindowId: string,
) => invoke<InternalDragSession>("cancel_internal_drag", { projectId, dragId, requesterWindowId });

type NativeWorkspaceEventHandler<T> = (payload: T) => void;

function listenFor<T>(eventName: string, handler: NativeWorkspaceEventHandler<T>): Promise<UnlistenFn> {
  return listen<T>(eventName, (event) => handler(event.payload));
}

export const listenForSessionRevisions = (handler: NativeWorkspaceEventHandler<AcceptedSessionMutation>) =>
  listenFor(NATIVE_WORKSPACE_EVENTS.sessionRevision, handler);

export const listenForWindowRegistry = (handler: NativeWorkspaceEventHandler<WindowRegistrySnapshot>) =>
  listenFor(NATIVE_WORKSPACE_EVENTS.windowRegistry, handler);

export const listenForWindowCloseRequests = (handler: NativeWorkspaceEventHandler<CloseDisposition>) =>
  listenFor(NATIVE_WORKSPACE_EVENTS.windowCloseRequested, handler);

export const listenForDragPreviews = (handler: NativeWorkspaceEventHandler<InternalDragSession>) =>
  listenFor(NATIVE_WORKSPACE_EVENTS.dragPreview, handler);

export const listenForDragAcknowledgements = (handler: NativeWorkspaceEventHandler<DragAcknowledgement>) =>
  listenFor(NATIVE_WORKSPACE_EVENTS.dragAcknowledged, handler);

export const listenForDragCancellations = (handler: NativeWorkspaceEventHandler<InternalDragSession>) =>
  listenFor(NATIVE_WORKSPACE_EVENTS.dragCancelled, handler);
