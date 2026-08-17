import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSession } from "./projectWorkspace.ts";
import { emptyDocument } from "./screenplay.ts";
import {
  activateDocumentTab,
  applyAcknowledgedDocumentTabTransfer,
  closeDocumentTab,
  createDocumentTabState,
  normalizeDocumentTabState,
  openDocumentTab,
  planDocumentRemoval,
  removeProjectDocument,
  reorderDocumentTab,
  reopenLastDocumentTab,
  updateDocumentView,
} from "./documentTabs.ts";

function threeDocumentSession() {
  const first = emptyDocument("First");
  first.id = "first";
  const session = createProjectSession(first);
  const second = emptyDocument("Second");
  second.id = "second";
  const third = emptyDocument("Third");
  third.id = "third";
  session.documents.push(second, third);
  return session;
}

test("document tabs are generic window-local views and close does not delete", () => {
  const session = threeDocumentSession();
  let tabs = createDocumentTabState(session.documents, "first");
  tabs = openDocumentTab(tabs, "second");
  tabs = openDocumentTab(tabs, "third");
  tabs = reorderDocumentTab(tabs, "third", 0);
  assert.deepEqual(tabs.openDocumentIds, ["third", "first", "second"]);
  tabs = activateDocumentTab(tabs, "first");
  tabs = closeDocumentTab(tabs, "first");
  assert.equal(tabs.activeDocumentId, "second");
  assert.deepEqual(tabs.recentlyClosedDocumentIds, ["first"]);
  assert.equal(session.documents.length, 3);
  tabs = reopenLastDocumentTab(tabs);
  assert.equal(tabs.activeDocumentId, "first");
  assert.deepEqual(tabs.openDocumentIds, ["third", "second", "first"]);
});

test("the final document tab cannot be closed by any caller", () => {
  const session = threeDocumentSession();
  const tabs = createDocumentTabState(session.documents, "first");
  assert.equal(closeDocumentTab(tabs, "first"), tabs);
  assert.deepEqual(tabs.openDocumentIds, ["first"]);
});

test("acknowledged cross-window move/copy updates destination before removing source", () => {
  const session = threeDocumentSession();
  let source = createDocumentTabState(session.documents, "first");
  source = openDocumentTab(source, "second");
  const destination = createDocumentTabState(session.documents, "third");
  const transfer = {
    dragId: "drag", projectId: session.projectId,
    payload: { kind: "document-tab" as const, documentId: "second", title: "Second" },
    effect: "move" as const, sourceWindowId: "source", destinationWindowId: "destination",
    target: { windowId: "destination", zoneId: "document:third", placement: "before" as const, destinationViewRevision: 1 },
    removeFromSource: true,
  };
  const moved = applyAcknowledgedDocumentTabTransfer(source, destination, transfer);
  assert.deepEqual(moved.destination.openDocumentIds, ["second", "third"]);
  assert.equal(moved.source.openDocumentIds.includes("second"), false);
  const copied = applyAcknowledgedDocumentTabTransfer(source, destination, { ...transfer, effect: "copy", removeFromSource: false });
  assert.equal(copied.source, source);
  assert.equal(copied.destination.openDocumentIds.includes("second"), true);
});

test("tab normalization repairs hostile persisted state and retains per-document view state", () => {
  const session = threeDocumentSession();
  const tabs = normalizeDocumentTabState({
    openDocumentIds: ["missing", "second", "second"],
    activeDocumentId: "third",
    recentlyClosedDocumentIds: ["missing", "first", "first"],
    views: {
      second: { sourceMode: true, editorScrollTop: -8, sourceSelection: { start: 7, end: 3 } },
    },
  }, session.documents);
  assert.deepEqual(tabs.openDocumentIds, ["second", "third"]);
  assert.equal(tabs.activeDocumentId, "third");
  assert.deepEqual(tabs.recentlyClosedDocumentIds, ["first"]);
  assert.equal(tabs.views.second.sourceMode, true);
  assert.equal(tabs.views.second.editorScrollTop, 0);
  assert.deepEqual(tabs.views.second.sourceSelection, { start: 7, end: 7 });
  const updated = updateDocumentView(tabs, "third", { activeBlockId: "block-3", editorScrollTop: 40 });
  assert.equal(updated.views.third.activeBlockId, "block-3");
  assert.equal(tabs.views.third.activeBlockId, undefined);
});

test("permanent document removal is permission-gated, protects the last script, and cleans dependencies", () => {
  const session = threeDocumentSession();
  session.workspace.reviews.push({
    id: "review", kind: "comment", authorId: "local-owner", targetType: "block", targetId: "b",
    documentId: "second", text: "Note", status: "open", createdAt: "now",
  });
  session.workspace.writerRoom.tasks.push({ id: "task", text: "Revise", documentId: "second", done: false });
  session.workspace.series.continuity.push({ id: "continuity", kind: "plot", title: "Thread", detail: "", episodeIds: ["second", "third"], resolved: false });
  session.workspace.series.seasons[0].episodeIds = ["first", "second", "third"];

  assert.equal(planDocumentRemoval(session, "second", false).reason, "permission");
  assert.throws(() => removeProjectDocument(session, "second", { canRemove: true, confirmedDocumentId: "third" }), /not confirmed/i);
  const result = removeProjectDocument(session, "second", { canRemove: true, confirmedDocumentId: "second" });
  assert.equal(result.session.updatedAt, session.updatedAt);
  assert.deepEqual(result.session.documents.map((document) => document.id), ["first", "third"]);
  assert.equal(result.recoveryDocument.id, "second");
  assert.deepEqual(result.dependencies.reviewIds, ["review"]);
  assert.equal(result.session.workspace.reviews.length, 0);
  assert.equal(result.session.workspace.writerRoom.tasks.length, 0);
  assert.deepEqual(result.session.workspace.series.continuity[0].episodeIds, ["third"]);
  assert.equal(session.documents.length, 3);

  const one = createProjectSession(emptyDocument("Only"));
  assert.equal(planDocumentRemoval(one, one.documents[0].id!, true).reason, "last-document");
});
