import type {
  DragAcknowledgement,
  InternalDragEffect,
  InternalDragPlacement,
  InternalDragSession,
  InternalDragTarget,
} from "../services/nativeWorkspaceService.ts";

export interface NativeInternalDragIdentity {
  projectId: string;
  sessionId: string;
  windowId: string;
  sessionRevision: number;
}

export type NativeInternalDragRole =
  | "none"
  | "source"
  | "destination"
  | "source-and-destination"
  | "observer";

export type NativeInternalDragOperation =
  | "begin-document"
  | "begin-panel"
  | "preview"
  | "acknowledge"
  | "cancel"
  | "view-change";

export type NativeInternalDragStatus =
  | "idle"
  | "beginning"
  | "dragging"
  | "available"
  | "previewing"
  | "observing"
  | "stale"
  | "acknowledging"
  | "cancelling"
  | "updating-view"
  | "acknowledged"
  | "cancelled"
  | "error";

export interface NativeInternalDragState {
  active: InternalDragSession | null;
  lastAcknowledgement: DragAcknowledgement | null;
  lastCancellation: InternalDragSession | null;
  /** Recent terminal ids prevent an in-flight bootstrap query from reviving a settled drag. */
  settledDragIds: readonly string[];
  viewRevision: number;
  operation: NativeInternalDragOperation | null;
  error: string | null;
}

export interface NativeInternalDragTaskQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
}

/** Keeps destination previews in pointer/focus request order without poisoning later work after a rejection. */
export function createNativeInternalDragTaskQueue(): NativeInternalDragTaskQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export function createNativeInternalDragState(viewRevision = 0): NativeInternalDragState {
  return {
    active: null,
    lastAcknowledgement: null,
    lastCancellation: null,
    settledDragIds: [],
    viewRevision: validRevision(viewRevision) ? viewRevision : 0,
    operation: null,
    error: null,
  };
}

export function validateNativeInternalDragIdentity(identity: NativeInternalDragIdentity): string | null {
  if (!validIdentifier(identity.projectId)) return "The native drag project id is invalid.";
  if (!validIdentifier(identity.sessionId)) return "The native drag session id is invalid.";
  if (!validIdentifier(identity.windowId)) return "The native drag window id is invalid.";
  if (!validRevision(identity.sessionRevision)) return "The native drag session revision is invalid.";
  return null;
}

export function nativeInternalDragRole(
  drag: InternalDragSession | null,
  windowId: string,
): NativeInternalDragRole {
  if (!drag) return "none";
  const source = drag.sourceWindowId === windowId;
  const destination = drag.target?.windowId === windowId;
  if (source && destination) return "source-and-destination";
  if (source) return "source";
  if (destination) return "destination";
  return "observer";
}

export function nativeInternalDragStatus(
  state: NativeInternalDragState,
  identity: Pick<NativeInternalDragIdentity, "windowId" | "sessionRevision">,
): NativeInternalDragStatus {
  if (state.error) return "error";
  switch (state.operation) {
    case "begin-document":
    case "begin-panel":
      return "beginning";
    case "acknowledge":
      return "acknowledging";
    case "cancel":
      return "cancelling";
    case "view-change":
      return "updating-view";
    case "preview":
      return "previewing";
  }
  if (state.active) {
    if (nativeInternalDragIsStale(state, identity)) return "stale";
    const role = nativeInternalDragRole(state.active, identity.windowId);
    if (!state.active.target) return role === "source" ? "dragging" : "available";
    return role === "observer" ? "observing" : "previewing";
  }
  if (state.lastAcknowledgement) return "acknowledged";
  if (state.lastCancellation) return "cancelled";
  return "idle";
}

export function nativeInternalDragIsStale(
  state: NativeInternalDragState,
  identity: Pick<NativeInternalDragIdentity, "windowId" | "sessionRevision">,
): boolean {
  const drag = state.active;
  if (!drag || drag.sessionRevision !== identity.sessionRevision) return drag !== null;
  const role = nativeInternalDragRole(drag, identity.windowId);
  if (role === "source" || role === "source-and-destination") {
    if (drag.sourceViewRevision !== state.viewRevision) return true;
  }
  if (role === "destination" || role === "source-and-destination") {
    if (drag.target?.viewRevision !== state.viewRevision) return true;
  }
  return false;
}

export function beginNativeInternalDragOperation(
  state: NativeInternalDragState,
  operation: NativeInternalDragOperation,
): NativeInternalDragState {
  return {
    ...state,
    operation,
    error: null,
    ...(operation === "begin-document" || operation === "begin-panel"
      ? { lastAcknowledgement: null, lastCancellation: null }
      : {}),
  };
}

export function failNativeInternalDragOperation(
  state: NativeInternalDragState,
  error: string,
): NativeInternalDragState {
  return { ...state, operation: null, error };
}

export function clearNativeInternalDragOutcome(state: NativeInternalDragState): NativeInternalDragState {
  return {
    ...state,
    lastAcknowledgement: null,
    lastCancellation: null,
    operation: null,
    error: null,
  };
}

export function applyNativeInternalDragPreview(
  state: NativeInternalDragState,
  drag: InternalDragSession,
  identity: NativeInternalDragIdentity,
): NativeInternalDragState {
  if (drag.projectId !== identity.projectId) return state;
  if (state.settledDragIds.includes(drag.dragId)) return state;
  const existingRole = nativeInternalDragRole(state.active, identity.windowId);
  const incomingRole = nativeInternalDragRole(drag, identity.windowId);
  if (
    state.active
    && state.active.dragId !== drag.dragId
    && existingRole !== "observer"
    && incomingRole === "observer"
  ) {
    return state;
  }
  return {
    ...state,
    active: drag,
    operation: null,
    error: null,
  };
}

export function applyNativeDragAcknowledgement(
  state: NativeInternalDragState,
  acknowledgement: DragAcknowledgement,
  identity: NativeInternalDragIdentity,
): NativeInternalDragState {
  if (acknowledgement.projectId !== identity.projectId) return state;
  const involved = acknowledgement.sourceWindowId === identity.windowId
    || acknowledgement.destinationWindowId === identity.windowId;
  const activeMatches = state.active?.dragId === acknowledgement.dragId;
  const settledDragIds = rememberSettledDragId(state.settledDragIds, acknowledgement.dragId);
  if (!involved && !activeMatches) {
    return settledDragIds === state.settledDragIds ? state : { ...state, settledDragIds };
  }
  let viewRevision = state.viewRevision;
  if (acknowledgement.sourceWindowId === identity.windowId) {
    viewRevision = Math.max(viewRevision, acknowledgement.sourceViewRevision);
  }
  if (acknowledgement.destinationWindowId === identity.windowId) {
    viewRevision = Math.max(viewRevision, acknowledgement.destinationViewRevision);
  }
  return {
    ...state,
    active: activeMatches ? null : state.active,
    lastAcknowledgement: involved ? acknowledgement : state.lastAcknowledgement,
    lastCancellation: involved ? null : state.lastCancellation,
    settledDragIds,
    viewRevision,
    operation: null,
    error: null,
  };
}

export function applyNativeDragCancellation(
  state: NativeInternalDragState,
  cancellation: InternalDragSession,
  identity: NativeInternalDragIdentity,
): NativeInternalDragState {
  if (cancellation.projectId !== identity.projectId) return state;
  const involved = cancellation.sourceWindowId === identity.windowId
    || cancellation.target?.windowId === identity.windowId;
  const activeMatches = state.active?.dragId === cancellation.dragId;
  const settledDragIds = rememberSettledDragId(state.settledDragIds, cancellation.dragId);
  if (!involved && !activeMatches) {
    return settledDragIds === state.settledDragIds ? state : { ...state, settledDragIds };
  }
  return {
    ...state,
    active: activeMatches ? null : state.active,
    lastAcknowledgement: involved ? null : state.lastAcknowledgement,
    lastCancellation: involved ? cancellation : state.lastCancellation,
    settledDragIds,
    operation: null,
    error: null,
  };
}

export function applyNativeViewRevision(
  state: NativeInternalDragState,
  viewRevision: number,
): NativeInternalDragState {
  if (!validRevision(viewRevision)) return state;
  return {
    ...state,
    viewRevision: Math.max(state.viewRevision, viewRevision),
    operation: state.operation === "view-change" ? null : state.operation,
    error: null,
  };
}

export function isNativeInternalDragSession(value: unknown): value is InternalDragSession {
  if (!isRecordWithKeys(value, [
    "dragId",
    "projectId",
    "sourceWindowId",
    "sourceViewRevision",
    "sessionRevision",
    "payload",
    "effect",
    "target",
  ])) return false;
  return validDragId(value.dragId)
    && validIdentifier(value.projectId)
    && validIdentifier(value.sourceWindowId)
    && validRevision(value.sourceViewRevision)
    && validRevision(value.sessionRevision)
    && isNativeInternalDragPayload(value.payload)
    && isInternalDragEffect(value.effect)
    && (value.target === null || isNativeInternalDragTarget(value.target));
}

export function isNativeDragAcknowledgement(value: unknown): value is DragAcknowledgement {
  if (!isRecordWithKeys(value, [
    "dragId",
    "projectId",
    "sourceWindowId",
    "destinationWindowId",
    "sourceViewRevision",
    "destinationViewRevision",
    "payload",
    "effect",
    "placement",
  ])) return false;
  return validDragId(value.dragId)
    && validIdentifier(value.projectId)
    && validIdentifier(value.sourceWindowId)
    && validIdentifier(value.destinationWindowId)
    && validRevision(value.sourceViewRevision)
    && validRevision(value.destinationViewRevision)
    && isNativeInternalDragPayload(value.payload)
    && isInternalDragEffect(value.effect)
    && isNativeInternalDragPlacement(value.placement);
}

export function isNativeInternalDragPlacement(value: unknown): value is InternalDragPlacement {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "document-tabs":
      return hasExactKeys(value, ["kind", "index"]) && validRevision(value.index);
    case "dock-group":
      return hasExactKeys(value, ["kind", "groupId", "edge"])
        && validIdentifier(value.groupId)
        && ["center", "left", "right", "top", "bottom"].includes(String(value.edge));
    case "floating-layer":
      return hasExactKeys(value, ["kind"]);
    default:
      return false;
  }
}

function isNativeInternalDragPayload(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "document-tab") {
    return hasExactKeys(value, ["kind", "documentId"]) && validIdentifier(value.documentId);
  }
  if (value.kind === "workspace-panel") {
    return hasExactKeys(value, ["kind", "panelId"]) && validIdentifier(value.panelId);
  }
  return false;
}

function isNativeInternalDragTarget(value: unknown): value is InternalDragTarget {
  return isRecordWithKeys(value, ["windowId", "viewRevision", "placement"])
    && validIdentifier(value.windowId)
    && validRevision(value.viewRevision)
    && isNativeInternalDragPlacement(value.placement);
}

function isInternalDragEffect(value: unknown): value is InternalDragEffect {
  return value === "move" || value === "copy";
}

function validDragId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 180 && /^drag-[a-zA-Z0-9_-]+$/.test(value);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && /^[a-zA-Z0-9][a-zA-Z0-9_:/.\-]*$/.test(value);
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const MAX_SETTLED_DRAG_IDS = 128;

function rememberSettledDragId(ids: readonly string[], dragId: string): readonly string[] {
  if (ids[ids.length - 1] === dragId) return ids;
  return [...ids.filter((candidate) => candidate !== dragId), dragId].slice(-MAX_SETTLED_DRAG_IDS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
