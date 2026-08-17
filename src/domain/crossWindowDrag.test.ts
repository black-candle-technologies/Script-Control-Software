import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgeInternalDrop,
  beginInternalDrag,
  cancelInternalDrag,
  closeWindowDuringInternalDrag,
  internalDragPreviewForWindow,
  parseInternalDragReference,
  previewInternalDrag,
  requestInternalDrop,
  serializeInternalDragReference,
  type CrossWindowDragState,
} from "./crossWindowDrag.ts";

function documentDrag(effect: "move" | "copy" = "move") {
  let state: CrossWindowDragState = beginInternalDrag({}, {
    id: "drag-one",
    projectId: "project",
    sourceWindowId: "source",
    sourceViewRevision: 2,
    sessionRevision: 7,
    payload: { kind: "document-tab", documentId: "doc", title: "Draft" },
    effect,
  });
  state = previewInternalDrag(state, "drag-one", {
    windowId: "destination", zoneId: "tabs", placement: "after", destinationViewRevision: 4,
  });
  return requestInternalDrop(state, "drag-one");
}

test("source and destination see the same preview and source changes only after acknowledgement", () => {
  const state = documentDrag();
  assert.equal(internalDragPreviewForWindow(state, "source")?.role, "source");
  assert.equal(internalDragPreviewForWindow(state, "destination")?.role, "destination");
  const accepted = acknowledgeInternalDrop(state, "drag-one", {
    currentSessionRevision: 7,
    sourceViewRevision: 2,
    destinationViewRevision: 4,
    sourceItemExists: true,
    destinationAccepts: true,
  });
  assert.equal(accepted.disposition, "accepted");
  assert.equal(accepted.transfer?.removeFromSource, true);
  assert.equal(accepted.transfer?.destinationWindowId, "destination");
  assert.equal(accepted.state.active, undefined);
});

test("copy retains source while stale source/destination and invalid targets cancel safely", () => {
  const copied = acknowledgeInternalDrop(documentDrag("copy"), "drag-one", {
    currentSessionRevision: 7, sourceViewRevision: 2, destinationViewRevision: 4,
    sourceItemExists: true, destinationAccepts: true,
  });
  assert.equal(copied.transfer?.removeFromSource, false);
  assert.equal(acknowledgeInternalDrop(documentDrag(), "drag-one", {
    currentSessionRevision: 8, sourceViewRevision: 2, destinationViewRevision: 4,
    sourceItemExists: true, destinationAccepts: true,
  }).reason, "stale-source");
  assert.equal(acknowledgeInternalDrop(documentDrag(), "drag-one", {
    currentSessionRevision: 7, sourceViewRevision: 2, destinationViewRevision: 5,
    sourceItemExists: true, destinationAccepts: true,
  }).reason, "stale-destination");
  assert.equal(acknowledgeInternalDrop(documentDrag(), "drag-one", {
    currentSessionRevision: 7, sourceViewRevision: 2, destinationViewRevision: 4,
    sourceItemExists: true, destinationAccepts: false,
  }).reason, "invalid-target");
});

test("Escape, drag end, and closing either participating window clear previews", () => {
  assert.equal(cancelInternalDrag(documentDrag(), "escape").lastCancellationReason, "escape");
  assert.equal(closeWindowDuringInternalDrag(documentDrag(), "source").lastCancellationReason, "source-closed");
  assert.equal(closeWindowDuringInternalDrag(documentDrag(), "destination").lastCancellationReason, "destination-closed");
});

test("DataTransfer contains only a validated coordinator drag id", () => {
  assert.equal(serializeInternalDragReference("drag-one"), "drag-one");
  assert.equal(parseInternalDragReference(" drag-one "), "drag-one");
  assert.equal(parseInternalDragReference("{\"documentId\":\"secret\"}"), undefined);
  assert.throws(() => serializeInternalDragReference("../drag"), /invalid/i);
});
