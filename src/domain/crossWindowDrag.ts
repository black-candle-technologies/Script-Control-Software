export type InternalDragPayload =
  | { kind: "document-tab"; documentId: string; title: string }
  | { kind: "workspace-panel"; panelId: string; title: string; copyable: boolean };

export type InternalDragEffect = "move" | "copy";

export interface InternalDragTarget {
  windowId: string;
  zoneId: string;
  placement: "before" | "after" | "center" | "left" | "right" | "top" | "bottom";
  destinationViewRevision: number;
}

export interface InternalDragSession {
  id: string;
  projectId: string;
  sourceWindowId: string;
  sourceViewRevision: number;
  sessionRevision: number;
  payload: InternalDragPayload;
  effect: InternalDragEffect;
  status: "dragging" | "previewing" | "awaiting-ack";
  target?: InternalDragTarget;
}

export interface CrossWindowDragState {
  active?: InternalDragSession;
  lastCancellationReason?: DragCancellationReason;
}

export type DragCancellationReason =
  | "escape"
  | "drag-end"
  | "invalid-target"
  | "stale-source"
  | "stale-destination"
  | "source-closed"
  | "destination-closed"
  | "item-missing"
  | "copy-not-supported"
  | "replaced";

export interface DragAcknowledgementContext {
  currentSessionRevision: number;
  sourceViewRevision: number;
  destinationViewRevision: number;
  sourceItemExists: boolean;
  destinationAccepts: boolean;
}

export interface AcknowledgedInternalTransfer {
  dragId: string;
  projectId: string;
  payload: InternalDragPayload;
  effect: InternalDragEffect;
  sourceWindowId: string;
  destinationWindowId: string;
  target: InternalDragTarget;
  removeFromSource: boolean;
}

export interface DragAcknowledgementResult {
  state: CrossWindowDragState;
  disposition: "accepted" | "missing" | "canceled";
  transfer?: AcknowledgedInternalTransfer;
  reason?: DragCancellationReason;
}

export function beginInternalDrag(
  state: CrossWindowDragState,
  input: Omit<InternalDragSession, "id" | "status" | "target"> & { id?: string },
): CrossWindowDragState {
  if (!input.projectId.trim() || !input.sourceWindowId.trim()) throw new Error("Drag project and source window are required.");
  if (input.effect === "copy" && input.payload.kind === "workspace-panel" && !input.payload.copyable) {
    throw new Error("This panel cannot be copied.");
  }
  return {
    active: {
      ...structuredClone(input),
      id: input.id?.trim() || `drag-${crypto.randomUUID()}`,
      status: "dragging",
    },
    ...(state.active ? { lastCancellationReason: "replaced" } : {}),
  };
}

export function previewInternalDrag(
  state: CrossWindowDragState,
  dragId: string,
  target: InternalDragTarget,
): CrossWindowDragState {
  if (state.active?.id !== dragId) return state;
  if (target.windowId === state.active.sourceWindowId && target.zoneId === sourceZoneId(state.active.payload)) {
    return { active: { ...state.active, status: "dragging", target: undefined } };
  }
  return { active: { ...state.active, status: "previewing", target: structuredClone(target) } };
}

export function requestInternalDrop(state: CrossWindowDragState, dragId: string): CrossWindowDragState {
  if (state.active?.id !== dragId || !state.active.target) return state;
  return { active: { ...state.active, status: "awaiting-ack" } };
}

/** Source removal is described only by the accepted transfer returned here. */
export function acknowledgeInternalDrop(
  state: CrossWindowDragState,
  dragId: string,
  context: DragAcknowledgementContext,
): DragAcknowledgementResult {
  const drag = state.active;
  if (!drag || drag.id !== dragId) return { state, disposition: "missing" };
  if (!drag.target || drag.status !== "awaiting-ack" || !context.destinationAccepts) {
    return canceled(state, "invalid-target");
  }
  if (!context.sourceItemExists) return canceled(state, "item-missing");
  if (drag.effect === "copy" && drag.payload.kind === "workspace-panel" && !drag.payload.copyable) {
    return canceled(state, "copy-not-supported");
  }
  if (context.currentSessionRevision !== drag.sessionRevision && drag.payload.kind === "document-tab") {
    return canceled(state, "stale-source");
  }
  if (context.sourceViewRevision !== drag.sourceViewRevision) return canceled(state, "stale-source");
  if (context.destinationViewRevision !== drag.target.destinationViewRevision) return canceled(state, "stale-destination");
  return {
    state: {},
    disposition: "accepted",
    transfer: {
      dragId: drag.id,
      projectId: drag.projectId,
      payload: structuredClone(drag.payload),
      effect: drag.effect,
      sourceWindowId: drag.sourceWindowId,
      destinationWindowId: drag.target.windowId,
      target: structuredClone(drag.target),
      removeFromSource: drag.effect === "move",
    },
  };
}

export function cancelInternalDrag(
  state: CrossWindowDragState,
  reason: DragCancellationReason,
): CrossWindowDragState {
  return state.active ? { lastCancellationReason: reason } : state;
}

export function closeWindowDuringInternalDrag(state: CrossWindowDragState, windowId: string): CrossWindowDragState {
  if (state.active?.sourceWindowId === windowId) return cancelInternalDrag(state, "source-closed");
  if (state.active?.target?.windowId === windowId) return cancelInternalDrag(state, "destination-closed");
  return state;
}

export function internalDragPreviewForWindow(
  state: CrossWindowDragState,
  windowId: string,
): { role: "source" | "destination"; drag: InternalDragSession } | undefined {
  const drag = state.active;
  if (!drag) return undefined;
  if (drag.sourceWindowId === windowId) return { role: "source", drag };
  if (drag.target?.windowId === windowId) return { role: "destination", drag };
  return undefined;
}

/** Safe HTML DataTransfer payload: the actual typed data stays in the coordinator. */
export function serializeInternalDragReference(dragId: string): string {
  if (!/^drag-[a-zA-Z0-9_-]+$/.test(dragId)) throw new Error("Internal drag id is invalid.");
  return dragId;
}

export function parseInternalDragReference(value: string): string | undefined {
  const id = value.trim();
  return /^drag-[a-zA-Z0-9_-]+$/.test(id) && id.length <= 128 ? id : undefined;
}

function canceled(state: CrossWindowDragState, reason: DragCancellationReason): DragAcknowledgementResult {
  return { state: cancelInternalDrag(state, reason), disposition: "canceled", reason };
}

function sourceZoneId(payload: InternalDragPayload): string {
  return payload.kind === "document-tab" ? `document:${payload.documentId}` : `panel:${payload.panelId}`;
}
