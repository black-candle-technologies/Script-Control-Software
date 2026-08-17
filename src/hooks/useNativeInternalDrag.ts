import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acknowledgeInternalDrag,
  advanceWorkspaceViewRevision,
  beginInternalDrag,
  cancelInternalDrag,
  listActiveInternalDrags,
  listenForDragAcknowledgements,
  listenForDragCancellations,
  listenForDragPreviews,
  previewInternalDrag,
  type DragAcknowledgement,
  type InternalDragEffect,
  type InternalDragPlacement,
  type InternalDragSession,
  type ProjectWindowRecord,
} from "../services/nativeWorkspaceService.ts";
import {
  applyNativeDragAcknowledgement,
  applyNativeDragCancellation,
  applyNativeInternalDragPreview,
  applyNativeViewRevision,
  beginNativeInternalDragOperation,
  clearNativeInternalDragOutcome,
  createNativeInternalDragTaskQueue,
  createNativeInternalDragState,
  failNativeInternalDragOperation,
  isNativeDragAcknowledgement,
  isNativeInternalDragPlacement,
  isNativeInternalDragSession,
  nativeInternalDragIsStale,
  nativeInternalDragRole,
  nativeInternalDragStatus,
  validateNativeInternalDragIdentity,
  type NativeInternalDragIdentity,
  type NativeInternalDragRole,
  type NativeInternalDragState,
  type NativeInternalDragStatus,
} from "./nativeInternalDragState.ts";

export interface UseNativeInternalDragOptions extends NativeInternalDragIdentity {
  /** Enable only after the native coordinator and window registry are ready. */
  enabled: boolean;
  /** Latest registry revision for this window. Revisions only move forward inside the hook. */
  viewRevision?: number;
}

export interface NativeInternalDragController {
  ready: boolean;
  active: InternalDragSession | null;
  lastAcknowledgement: DragAcknowledgement | null;
  lastCancellation: InternalDragSession | null;
  viewRevision: number;
  role: NativeInternalDragRole;
  status: NativeInternalDragStatus;
  error: string | null;
  isSource: boolean;
  isDestination: boolean;
  canPreview: boolean;
  canAcknowledge: boolean;
  canCancel: boolean;
  stale: boolean;
  markViewChanged: () => Promise<ProjectWindowRecord>;
  beginDocumentTransfer: (documentId: string, effect?: InternalDragEffect) => Promise<InternalDragSession>;
  beginPanelTransfer: (panelId: string, effect?: InternalDragEffect) => Promise<InternalDragSession>;
  preview: (placement: InternalDragPlacement, dragId?: string) => Promise<InternalDragSession>;
  acknowledge: (dragId?: string) => Promise<DragAcknowledgement>;
  cancel: (dragId?: string) => Promise<InternalDragSession>;
  clearOutcome: () => void;
}

export function useNativeInternalDrag(options: UseNativeInternalDragOptions): NativeInternalDragController {
  const initialViewRevision = validRevision(options.viewRevision) ? options.viewRevision : 0;
  const [state, setReactState] = useState<NativeInternalDragState>(() => createNativeInternalDragState(initialViewRevision));
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  const identityRef = useRef<NativeInternalDragIdentity>(options);
  const enabledRef = useRef(options.enabled);
  const readyRef = useRef(false);
  const mountedRef = useRef(false);
  const viewTailRef = useRef<Promise<void>>(Promise.resolve());
  const previewQueueRef = useRef(createNativeInternalDragTaskQueue());
  const identityKey = `${options.projectId}\u0000${options.sessionId}\u0000${options.windowId}`;

  identityRef.current = {
    projectId: options.projectId,
    sessionId: options.sessionId,
    windowId: options.windowId,
    sessionRevision: options.sessionRevision,
  };
  enabledRef.current = options.enabled;

  const commit = useCallback((update: (current: NativeInternalDragState) => NativeInternalDragState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    if (mountedRef.current) setReactState(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const next = createNativeInternalDragState(validRevision(options.viewRevision) ? options.viewRevision : 0);
    stateRef.current = next;
    setReactState(next);
    readyRef.current = false;
    setReady(false);
  }, [identityKey]);

  useEffect(() => {
    if (!validRevision(options.viewRevision)) return;
    commit((current) => applyNativeViewRevision(current, options.viewRevision as number));
  }, [commit, options.viewRevision]);

  useEffect(() => {
    readyRef.current = false;
    setReady(false);
    if (!options.enabled) {
      commit((current) => createNativeInternalDragState(current.viewRevision));
      return;
    }
    const identity = identityRef.current;
    const identityError = validateNativeInternalDragIdentity(identity);
    if (identityError) {
      commit((current) => failNativeInternalDragOperation(current, identityError));
      return;
    }
    let stopped = false;
    const stops: (() => void)[] = [];
    void (async () => {
      try {
        const stopAcknowledgements = await listenForDragAcknowledgements((payload: unknown) => {
          if (stopped) return;
          if (!isNativeDragAcknowledgement(payload)) {
            commit((current) => failNativeInternalDragOperation(current, "Received an invalid native drag acknowledgement."));
            return;
          }
          commit((current) => applyNativeDragAcknowledgement(current, payload, identityRef.current));
        });
        if (stopped) { stopAcknowledgements(); return; }
        stops.push(stopAcknowledgements);
        const stopCancellations = await listenForDragCancellations((payload: unknown) => {
          if (stopped) return;
          if (!isNativeInternalDragSession(payload)) {
            commit((current) => failNativeInternalDragOperation(current, "Received an invalid native drag cancellation."));
            return;
          }
          commit((current) => applyNativeDragCancellation(current, payload, identityRef.current));
        });
        if (stopped) { stopCancellations(); return; }
        stops.push(stopCancellations);
        const stopPreviews = await listenForDragPreviews((payload: unknown) => {
          if (stopped) return;
          if (!isNativeInternalDragSession(payload)) {
            commit((current) => failNativeInternalDragOperation(current, "Received an invalid native drag preview."));
            return;
          }
          commit((current) => applyNativeInternalDragPreview(current, payload, identityRef.current));
        });
        if (stopped) { stopPreviews(); return; }
        stops.push(stopPreviews);
        const activeDrags = await listActiveInternalDrags(
          identity.projectId,
          identity.sessionId,
          identity.windowId,
        );
        if (stopped) return;
        if (
          !Array.isArray(activeDrags)
          || activeDrags.some((drag) => !isNativeInternalDragSession(drag) || drag.projectId !== identity.projectId)
        ) {
          throw new Error("Received an invalid active native drag snapshot.");
        }
        activeDrags.forEach((drag) => {
          commit((current) => applyNativeInternalDragPreview(current, drag, identityRef.current));
        });
        readyRef.current = true;
        setReady(true);
      } catch (cause) {
        stops.splice(0).forEach((stop) => stop());
        if (!stopped) commit((current) => failNativeInternalDragOperation(current, errorMessage(cause)));
      }
    })();
    return () => {
      stopped = true;
      readyRef.current = false;
      stops.forEach((stop) => stop());
    };
  }, [commit, identityKey, options.enabled]);

  const requireContext = useCallback((listenersRequired = true): NativeInternalDragIdentity => {
    if (!enabledRef.current) throw new Error("Native internal drag is not enabled.");
    if (listenersRequired && !readyRef.current) throw new Error("Native internal drag listeners are not ready.");
    const identity = identityRef.current;
    const identityError = validateNativeInternalDragIdentity(identity);
    if (identityError) throw new Error(identityError);
    return identity;
  }, []);

  const fail = useCallback((cause: unknown): never => {
    const message = errorMessage(cause);
    commit((current) => failNativeInternalDragOperation(current, message));
    throw cause instanceof Error ? cause : new Error(message);
  }, [commit]);

  const getContext = useCallback((listenersRequired = true): NativeInternalDragIdentity => {
    try {
      return requireContext(listenersRequired);
    } catch (cause) {
      return fail(cause);
    }
  }, [fail, requireContext]);

  const markViewChanged = useCallback((): Promise<ProjectWindowRecord> => {
    const task = viewTailRef.current.then(async () => {
      const identity = getContext(false);
      commit((current) => beginNativeInternalDragOperation(current, "view-change"));
      const baseRevision = stateRef.current.viewRevision;
      try {
        const record = await advanceWorkspaceViewRevision(identity.projectId, identity.windowId, baseRevision);
        if (
          !sameIdentityContext(identity, identityRef.current)
          ||
          record.projectId !== identity.projectId
          || record.windowId !== identity.windowId
          || !validRevision(record.viewRevision)
          || record.viewRevision !== baseRevision + 1
        ) {
          throw new Error("The native view revision response did not match this window.");
        }
        commit((current) => applyNativeViewRevision(current, record.viewRevision));
        return record;
      } catch (cause) {
        return fail(cause);
      }
    });
    viewTailRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [commit, fail, getContext]);

  const beginTransfer = useCallback(async (
    payload: { kind: "document-tab"; documentId: string } | { kind: "workspace-panel"; panelId: string },
    effect: InternalDragEffect,
  ): Promise<InternalDragSession> => {
    await viewTailRef.current;
    const identity = getContext();
    const identifier = payload.kind === "document-tab" ? payload.documentId : payload.panelId;
    if (!validIdentifier(identifier)) return fail(new Error("The dragged item identifier is invalid."));
    if (effect !== "move" && effect !== "copy") return fail(new Error("The native drag effect is invalid."));
    const operation = payload.kind === "document-tab" ? "begin-document" : "begin-panel";
    commit((current) => beginNativeInternalDragOperation(current, operation));
    const request = {
      projectId: identity.projectId,
      sourceWindowId: identity.windowId,
      sourceViewRevision: stateRef.current.viewRevision,
      sessionRevision: identity.sessionRevision,
      payload,
      effect,
    } as const;
    try {
      const drag = await beginInternalDrag(request);
      if (
        !isNativeInternalDragSession(drag)
        || !sameIdentityContext(identity, identityRef.current)
        || drag.projectId !== request.projectId
        || drag.sourceWindowId !== request.sourceWindowId
        || drag.sourceViewRevision !== request.sourceViewRevision
        || drag.sessionRevision !== request.sessionRevision
        || drag.effect !== effect
        || !samePayload(drag.payload, payload)
        || drag.target !== null
      ) {
        throw new Error("The native drag response did not match its source request.");
      }
      commit((current) => applyNativeInternalDragPreview(current, drag, identity));
      return drag;
    } catch (cause) {
      return fail(cause);
    }
  }, [commit, fail, getContext]);

  const beginDocumentTransfer = useCallback(
    (documentId: string, effect: InternalDragEffect = "move") => beginTransfer({ kind: "document-tab", documentId }, effect),
    [beginTransfer],
  );
  const beginPanelTransfer = useCallback(
    (panelId: string, effect: InternalDragEffect = "move") => beginTransfer({ kind: "workspace-panel", panelId }, effect),
    [beginTransfer],
  );

  const preview = useCallback((
    placement: InternalDragPlacement,
    dragId?: string,
  ): Promise<InternalDragSession> => previewQueueRef.current.enqueue(async () => {
      await viewTailRef.current;
      const identity = getContext();
      if (!isNativeInternalDragPlacement(placement)) return fail(new Error("The native drag placement is invalid."));
      const active = stateRef.current.active;
      const selectedDragId = dragId ?? active?.dragId;
      if (!selectedDragId || active?.dragId !== selectedDragId) {
        return fail(new Error("The requested native drag is not active in this window."));
      }
      if (nativeInternalDragIsStale(stateRef.current, identity)) {
        return fail(new Error("The native drag became stale before its destination preview."));
      }
      commit((current) => beginNativeInternalDragOperation(current, "preview"));
      const destinationViewRevision = stateRef.current.viewRevision;
      try {
        const drag = await previewInternalDrag(identity.projectId, selectedDragId, {
          windowId: identity.windowId,
          viewRevision: destinationViewRevision,
          placement,
        });
        if (
          !isNativeInternalDragSession(drag)
          || !sameIdentityContext(identity, identityRef.current)
          || drag.projectId !== identity.projectId
          || drag.dragId !== selectedDragId
          || !sameDragSource(drag, active)
          || drag.target?.windowId !== identity.windowId
          || drag.target.viewRevision !== destinationViewRevision
          || !samePlacement(drag.target.placement, placement)
        ) {
          throw new Error("The native drag preview response did not match this destination.");
        }
        commit((current) => applyNativeInternalDragPreview(current, drag, identity));
        return drag;
      } catch (cause) {
        return fail(cause);
      }
    }), [commit, fail, getContext]);

  const acknowledge = useCallback(async (dragId?: string): Promise<DragAcknowledgement> => {
    await viewTailRef.current;
    const identity = getContext();
    const active = stateRef.current.active;
    const selectedDragId = dragId ?? active?.dragId;
    if (!selectedDragId || active?.dragId !== selectedDragId || active.target?.windowId !== identity.windowId) {
      return fail(new Error("Only the active native drag destination can acknowledge this drop."));
    }
    if (nativeInternalDragIsStale(stateRef.current, identity)) {
      return fail(new Error("The native drag became stale before acknowledgement."));
    }
    commit((current) => beginNativeInternalDragOperation(current, "acknowledge"));
    try {
      const acknowledgement = await acknowledgeInternalDrag({
        projectId: identity.projectId,
        sessionId: identity.sessionId,
        dragId: selectedDragId,
        destinationWindowId: identity.windowId,
      });
      if (
        !isNativeDragAcknowledgement(acknowledgement)
        || !sameIdentityContext(identity, identityRef.current)
        || acknowledgement.projectId !== identity.projectId
        || acknowledgement.dragId !== selectedDragId
        || acknowledgement.destinationWindowId !== identity.windowId
        || acknowledgement.sourceWindowId !== active.sourceWindowId
        || acknowledgement.effect !== active.effect
        || !samePayload(acknowledgement.payload, active.payload)
        || !samePlacement(acknowledgement.placement, active.target.placement)
      ) {
        throw new Error("The native drag acknowledgement did not match this destination.");
      }
      commit((current) => applyNativeDragAcknowledgement(current, acknowledgement, identity));
      return acknowledgement;
    } catch (cause) {
      return fail(cause);
    }
  }, [commit, fail, getContext]);

  const cancel = useCallback(async (dragId?: string): Promise<InternalDragSession> => {
    await viewTailRef.current;
    const identity = getContext();
    const active = stateRef.current.active;
    const selectedDragId = dragId ?? active?.dragId;
    const role = nativeInternalDragRole(active, identity.windowId);
    if (!selectedDragId || active?.dragId !== selectedDragId || (role !== "source" && role !== "destination" && role !== "source-and-destination")) {
      return fail(new Error("Only the active native drag source or destination can cancel it."));
    }
    commit((current) => beginNativeInternalDragOperation(current, "cancel"));
    try {
      const cancellation = await cancelInternalDrag(identity.projectId, selectedDragId, identity.windowId);
      if (
        !isNativeInternalDragSession(cancellation)
        || !sameIdentityContext(identity, identityRef.current)
        || cancellation.projectId !== identity.projectId
        || cancellation.dragId !== selectedDragId
        || !sameDragSource(cancellation, active)
      ) {
        throw new Error("The native drag cancellation did not match the active drag.");
      }
      commit((current) => applyNativeDragCancellation(current, cancellation, identity));
      return cancellation;
    } catch (cause) {
      return fail(cause);
    }
  }, [commit, fail, getContext]);

  const clearOutcome = useCallback(() => {
    commit(clearNativeInternalDragOutcome);
  }, [commit]);

  const role = nativeInternalDragRole(state.active, options.windowId);
  const stale = nativeInternalDragIsStale(state, identityRef.current);
  const status = nativeInternalDragStatus(state, identityRef.current);
  const identityError = options.enabled ? validateNativeInternalDragIdentity(identityRef.current) : null;
  const error = state.error ?? identityError;

  return useMemo(() => ({
    ready,
    active: state.active,
    lastAcknowledgement: state.lastAcknowledgement,
    lastCancellation: state.lastCancellation,
    viewRevision: state.viewRevision,
    role,
    status: error ? "error" : status,
    error,
    isSource: role === "source" || role === "source-and-destination",
    isDestination: role === "destination" || role === "source-and-destination",
    canPreview: ready && !stale && state.active !== null,
    canAcknowledge: ready && !stale && (role === "destination" || role === "source-and-destination"),
    canCancel: ready && (role === "source" || role === "destination" || role === "source-and-destination"),
    stale,
    markViewChanged,
    beginDocumentTransfer,
    beginPanelTransfer,
    preview,
    acknowledge,
    cancel,
    clearOutcome,
  }), [
    acknowledge,
    beginDocumentTransfer,
    beginPanelTransfer,
    cancel,
    clearOutcome,
    error,
    markViewChanged,
    preview,
    ready,
    role,
    state,
    stale,
    status,
  ]);
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && /^[a-zA-Z0-9][a-zA-Z0-9_:/.\-]*$/.test(value);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function sameIdentityContext(left: NativeInternalDragIdentity, right: NativeInternalDragIdentity): boolean {
  return left.projectId === right.projectId
    && left.sessionId === right.sessionId
    && left.windowId === right.windowId;
}

function sameDragSource(left: InternalDragSession, right: InternalDragSession): boolean {
  return left.projectId === right.projectId
    && left.sourceWindowId === right.sourceWindowId
    && left.sourceViewRevision === right.sourceViewRevision
    && left.sessionRevision === right.sessionRevision
    && left.effect === right.effect
    && samePayload(left.payload, right.payload);
}

function samePayload(left: InternalDragSession["payload"], right: InternalDragSession["payload"]): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "document-tab"
    ? left.documentId === (right.kind === "document-tab" ? right.documentId : undefined)
    : left.panelId === (right.kind === "workspace-panel" ? right.panelId : undefined);
}

function samePlacement(left: InternalDragPlacement, right: InternalDragPlacement): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "document-tabs") {
    return left.index === (right.kind === "document-tabs" ? right.index : undefined);
  }
  if (left.kind === "dock-group") {
    return right.kind === "dock-group" && left.groupId === right.groupId && left.edge === right.edge;
  }
  return true;
}
