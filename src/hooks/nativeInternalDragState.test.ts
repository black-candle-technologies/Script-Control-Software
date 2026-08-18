import assert from "node:assert/strict";
import test from "node:test";

import type { DragAcknowledgement, InternalDragSession } from "../services/nativeWorkspaceService.ts";
import {
  applyNativeDragAcknowledgement,
  applyNativeDragCancellation,
  applyNativeInternalDragPreview,
  createNativeInternalDragTaskQueue,
  createNativeInternalDragState,
  isNativeDragAcknowledgement,
  isNativeInternalDragSession,
  nativeInternalDragRole,
  nativeInternalDragStatus,
  validateNativeInternalDragIdentity,
  type NativeInternalDragIdentity,
} from "./nativeInternalDragState.ts";

const identity: NativeInternalDragIdentity = {
  projectId: "project-1",
  sessionId: "session-1",
  windowId: "window-destination",
  sessionRevision: 4,
};

const drag: InternalDragSession = {
  dragId: "drag-123-abc",
  projectId: "project-1",
  sourceWindowId: "window-source",
  sourceViewRevision: 2,
  sessionRevision: 4,
  payload: { kind: "document-tab", documentId: "document-1" },
  effect: "move",
  target: null,
};

test("native drag event guards enforce the identifier-only wire format", () => {
  assert.equal(isNativeInternalDragSession(drag), true);
  assert.equal(isNativeInternalDragSession({
    ...drag,
    payload: { kind: "document-tab", documentId: "document-1", title: "inline data" },
  }), false);
  assert.equal(isNativeInternalDragSession({ ...drag, sourceViewRevision: -1 }), false);

  const acknowledgement: DragAcknowledgement = {
    dragId: drag.dragId,
    projectId: drag.projectId,
    sourceWindowId: drag.sourceWindowId,
    destinationWindowId: identity.windowId,
    sourceViewRevision: 3,
    destinationViewRevision: 8,
    payload: drag.payload,
    effect: drag.effect,
    placement: { kind: "dock-group", groupId: "editor-main", edge: "right" },
  };
  assert.equal(isNativeDragAcknowledgement(acknowledgement), true);
  assert.equal(isNativeDragAcknowledgement({ ...acknowledgement, destinationWindowId: "bad window" }), false);
});

test("a destination observes, previews, and applies an acknowledgement revision", () => {
  let state = applyNativeInternalDragPreview(createNativeInternalDragState(7), drag, identity);
  assert.equal(nativeInternalDragRole(state.active, identity.windowId), "observer");
  assert.equal(nativeInternalDragStatus(state, identity), "available");

  const previewed: InternalDragSession = {
    ...drag,
    target: {
      windowId: identity.windowId,
      viewRevision: 7,
      placement: { kind: "document-tabs", index: 1 },
    },
  };
  state = applyNativeInternalDragPreview(state, previewed, identity);
  assert.equal(nativeInternalDragRole(state.active, identity.windowId), "destination");
  assert.equal(nativeInternalDragStatus(state, identity), "previewing");

  const acknowledgement: DragAcknowledgement = {
    dragId: drag.dragId,
    projectId: drag.projectId,
    sourceWindowId: drag.sourceWindowId,
    destinationWindowId: identity.windowId,
    sourceViewRevision: 3,
    destinationViewRevision: 8,
    payload: drag.payload,
    effect: drag.effect,
    placement: previewed.target!.placement,
  };
  state = applyNativeDragAcknowledgement(state, acknowledgement, identity);
  assert.equal(state.active, null);
  assert.equal(state.lastAcknowledgement, acknowledgement);
  assert.equal(state.viewRevision, 8);
  assert.equal(nativeInternalDragStatus(state, identity), "acknowledged");
});

test("cancellation clears observer overlays without claiming another window's outcome", () => {
  const observing = applyNativeInternalDragPreview(createNativeInternalDragState(), drag, identity);
  const cancelled = applyNativeDragCancellation(observing, drag, identity);
  assert.equal(cancelled.active, null);
  assert.equal(cancelled.lastCancellation, null);

  const sourceIdentity = { ...identity, windowId: drag.sourceWindowId };
  const sourceState = applyNativeInternalDragPreview(createNativeInternalDragState(), drag, sourceIdentity);
  const sourceCancelled = applyNativeDragCancellation(sourceState, drag, sourceIdentity);
  assert.equal(sourceCancelled.active, null);
  assert.equal(sourceCancelled.lastCancellation, drag);
  assert.equal(nativeInternalDragStatus(sourceCancelled, sourceIdentity), "cancelled");
});

test("terminal events received during bootstrap prevent a late snapshot from reviving the drag", () => {
  const acknowledgement: DragAcknowledgement = {
    dragId: drag.dragId,
    projectId: drag.projectId,
    sourceWindowId: drag.sourceWindowId,
    destinationWindowId: "window-other",
    sourceViewRevision: 3,
    destinationViewRevision: 1,
    payload: drag.payload,
    effect: drag.effect,
    placement: { kind: "document-tabs", index: 0 },
  };
  const afterAcknowledgement = applyNativeDragAcknowledgement(
    createNativeInternalDragState(),
    acknowledgement,
    identity,
  );
  assert.deepEqual(afterAcknowledgement.settledDragIds, [drag.dragId]);
  assert.equal(
    applyNativeInternalDragPreview(afterAcknowledgement, drag, identity),
    afterAcknowledgement,
  );

  const cancellation = { ...drag, dragId: "drag-cancelled-late" };
  const afterCancellation = applyNativeDragCancellation(
    createNativeInternalDragState(),
    cancellation,
    identity,
  );
  assert.deepEqual(afterCancellation.settledDragIds, [cancellation.dragId]);
  assert.equal(
    applyNativeInternalDragPreview(afterCancellation, cancellation, identity),
    afterCancellation,
  );
});

test("session and window revision changes make an active transfer stale", () => {
  const sourceIdentity = { ...identity, windowId: drag.sourceWindowId };
  const sourceState = applyNativeInternalDragPreview(createNativeInternalDragState(2), drag, sourceIdentity);
  assert.equal(nativeInternalDragStatus(sourceState, sourceIdentity), "dragging");
  assert.equal(nativeInternalDragStatus(sourceState, { ...sourceIdentity, sessionRevision: 5 }), "stale");
  assert.equal(nativeInternalDragStatus({ ...sourceState, viewRevision: 3 }, sourceIdentity), "stale");
});

test("native preview tasks preserve request order after slow work and rejection", async () => {
  const queue = createNativeInternalDragTaskQueue();
  const calls: string[] = [];
  let releaseFirst = () => {};
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const first = queue.enqueue(async () => {
    calls.push("first-start");
    await firstGate;
    calls.push("first-end");
    return 1;
  });
  const rejected = queue.enqueue(async () => {
    calls.push("second");
    throw new Error("expected rejection");
  });
  const third = queue.enqueue(async () => {
    calls.push("third");
    return 3;
  });
  await Promise.resolve();
  assert.deepEqual(calls, ["first-start"]);
  releaseFirst();
  assert.equal(await first, 1);
  await assert.rejects(rejected, /expected rejection/);
  assert.equal(await third, 3);
  assert.deepEqual(calls, ["first-start", "first-end", "second", "third"]);
});

test("project filtering and identity validation reject cross-project or malformed state", () => {
  const initial = createNativeInternalDragState();
  assert.equal(
    applyNativeInternalDragPreview(initial, { ...drag, projectId: "project-2" }, identity),
    initial,
  );
  assert.equal(validateNativeInternalDragIdentity(identity), null);
  assert.match(
    validateNativeInternalDragIdentity({ ...identity, sessionId: "session with spaces" }) ?? "",
    /session id/i,
  );
});
