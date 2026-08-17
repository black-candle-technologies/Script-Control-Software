import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSession } from "./projectWorkspace.ts";
import { emptyDocument } from "./screenplay.ts";
import { normalizeWorkspaceLayout } from "./workspaceLayouts.ts";
import { isWorkspaceDockLayout } from "./dockTree.ts";
import {
  SerializedSessionSaveQueue,
  blockCoordinatorFingerprint,
  createMutationEnvelope,
  createSessionCoordinatorState,
  deriveSessionMutation,
  submitSessionMutation,
} from "./sessionCoordinator.ts";

function coordinatedSession() {
  const first = emptyDocument("First");
  first.id = "first";
  first.blocks = [
    { id: "one", type: "action", text: "One" },
    { id: "two", type: "action", text: "Two" },
  ];
  const second = emptyDocument("Second");
  second.id = "second";
  second.blocks = [{ id: "other", type: "action", text: "Other" }];
  const session = createProjectSession(first);
  session.projectId = "project";
  session.documents.push(second);
  return session;
}

test("authoritative coordinator accepts current actions and deduplicates action ids", () => {
  let state = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const action = createMutationEnvelope(state, "window-a", { kind: "set-project-name", name: "New Name" }, { actionId: "action-1", issuedAt: "one" });
  const accepted = submitSessionMutation(state, action);
  assert.equal(accepted.disposition, "accepted");
  assert.equal(accepted.state.revision, 1);
  assert.equal(accepted.state.session.name, "New Name");
  state = accepted.state;
  const duplicate = submitSessionMutation(state, action);
  assert.equal(duplicate.disposition, "duplicate");
  assert.equal(duplicate.state.revision, 1);
});

test("coordinator authenticates the registered window and rejects read-only collaborators", () => {
  const session = coordinatedSession();
  session.workspace.collaborators.push({ id: "viewer", name: "Viewer", role: "viewer" });
  const state = createSessionCoordinatorState(session, { sessionId: "live" });
  const viewer = createMutationEnvelope(state, "window-a", { kind: "set-project-name", name: "Nope" }, { actorId: "viewer" });
  assert.equal(submitSessionMutation(state, viewer, { registeredWindowId: "window-a" }).reason, "permission");
  const forged = createMutationEnvelope(state, "window-a", { kind: "set-project-name", name: "Nope" });
  assert.equal(submitSessionMutation(state, forged, { registeredWindowId: "window-b" }).reason, "wrong-origin");

  const viewerSession = structuredClone(session);
  viewerSession.workspace.currentUserId = "viewer";
  const viewerState = createSessionCoordinatorState(viewerSession, { sessionId: "live" });
  const viewerEdit = createMutationEnvelope(viewerState, "window-a", { kind: "set-project-name", name: "Viewer edit" });
  assert.equal(submitSessionMutation(viewerState, viewerEdit, { registeredWindowId: "window-a" }).reason, "permission");
  const impersonatedOwner = createMutationEnvelope(
    viewerState,
    "window-a",
    { kind: "set-project-name", name: "Forged owner edit" },
    { actorId: session.workspace.currentUserId },
  );
  const impersonation = submitSessionMutation(viewerState, impersonatedOwner, { registeredWindowId: "window-a" });
  assert.equal(impersonation.reason, "permission");
  assert.match(impersonation.message ?? "", /authoritative local project identity/i);
  assert.equal(impersonation.state.session.name, "First");
  assert.equal(state.session.name, "First");
});

test("durable mutations preserve the portable disk token until a saved session installs a new one", () => {
  const state = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const diskToken = state.session.updatedAt;
  const edit = createMutationEnvelope(
    state,
    "window-a",
    { kind: "set-project-name", name: "Edited in memory" },
    { issuedAt: "2099-12-31T23:59:59.999Z" },
  );
  const edited = submitSessionMutation(state, edit);
  assert.equal(edited.state.session.updatedAt, diskToken);

  const saved = { ...edited.state.session, updatedAt: "2100-01-01T00:00:00.000Z" };
  const savedMutation = deriveSessionMutation(edited.state.session, saved);
  assert.deepEqual(savedMutation, {
    kind: "set-persistence-metadata",
    projectPath: saved.projectPath,
    updatedAt: saved.updatedAt,
  });
  const installed = submitSessionMutation(
    edited.state,
    createMutationEnvelope(edited.state, "window-a", savedMutation),
  );
  assert.equal(installed.state.session.updatedAt, saved.updatedAt);
});

test("persistence, name, workspace, and history metadata derive granular batches", () => {
  const before = coordinatedSession();
  const after = structuredClone(before);
  after.name = "Saved Project";
  after.projectPath = "C:/Projects/saved.scsproject";
  after.updatedAt = "2100-01-01T00:00:00.000Z";
  after.workspace.sync.branch = "saved-branch";
  after.versionHistory.activeBranchId = "saved-history";
  assert.deepEqual(
    (deriveSessionMutation(before, after) as { kind: "batch"; mutations: { kind: string }[] }).mutations.map((mutation) => mutation.kind),
    ["set-project-name", "set-workspace", "set-version-history", "set-persistence-metadata"],
  );
});

test("a stale save-metadata completion reconciles without erasing a concurrent block edit", () => {
  const original = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const changedBlock = { ...original.session.documents[0].blocks[0], text: "Concurrent edit" };
  const afterBlock = submitSessionMutation(original, createMutationEnvelope(original, "window-b", {
    kind: "replace-block",
    documentId: "first",
    blockId: "one",
    block: changedBlock,
  }, { actionId: "concurrent-block" })).state;

  const saved = {
    ...original.session,
    name: "Saved Project",
    projectPath: "C:/Projects/saved.scsproject",
    updatedAt: "2100-01-01T00:00:00.000Z",
  };
  const completion = createMutationEnvelope(
    original,
    "window-a",
    deriveSessionMutation(original.session, saved),
    { actionId: "save-completion" },
  );
  const reconciled = submitSessionMutation(afterBlock, completion);
  assert.equal(reconciled.disposition, "reconciled");
  assert.equal(reconciled.state.session.documents[0].blocks[0].text, "Concurrent edit");
  assert.equal(reconciled.state.session.name, saved.name);
  assert.equal(reconciled.state.session.projectPath, saved.projectPath);
  assert.equal(reconciled.state.session.updatedAt, saved.updatedAt);
});

test("stale actions reconcile across different blocks and documents but reject same-target races", () => {
  let state = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const original = state;
  const one = structuredClone(state.session.documents[0].blocks[0]);
  one.text = "Window A";
  const other = structuredClone(state.session.documents[1].blocks[0]);
  other.text = "Window B";
  const fromA = createMutationEnvelope(original, "window-a", { kind: "replace-block", documentId: "first", blockId: "one", block: one }, { actionId: "a", issuedAt: "a" });
  const fromB = createMutationEnvelope(original, "window-b", { kind: "replace-block", documentId: "second", blockId: "other", block: other }, { actionId: "b", issuedAt: "b" });
  state = submitSessionMutation(state, fromA).state;
  const reconciled = submitSessionMutation(state, fromB);
  assert.equal(reconciled.disposition, "reconciled");
  assert.equal(reconciled.state.session.documents[0].blocks[0].text, "Window A");
  assert.equal(reconciled.state.session.documents[1].blocks[0].text, "Window B");

  const conflicting = structuredClone(one);
  conflicting.text = "Window C";
  const fromC = createMutationEnvelope(original, "window-c", { kind: "replace-block", documentId: "first", blockId: "one", block: conflicting }, { actionId: "c", issuedAt: "c" });
  const rejected = submitSessionMutation(reconciled.state, fromC);
  assert.equal(rejected.disposition, "rejected");
  assert.equal(rejected.reason, "stale-conflict");
  assert.equal(rejected.state.revision, 2);
});

test("stale whole-workspace writes cannot erase layouts while granular layout edits can rebase", () => {
  const original = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const customLayout = {
    ...normalizeWorkspaceLayout(original.session.workspace.layouts[0]),
    id: "custom-layout",
    name: "Custom layout",
  };
  const layoutEdit = createMutationEnvelope(original, "window-a", { kind: "upsert-layout", layout: customLayout }, { actionId: "layout" });
  const afterLayout = submitSessionMutation(original, layoutEdit).state;
  assert.equal(afterLayout.session.workspace.activeLayoutId, original.session.workspace.activeLayoutId);
  assert.equal(isWorkspaceDockLayout(afterLayout.session.workspace.layouts.find((layout) => layout.id === customLayout.id)), true);
  const staleWorkspace = structuredClone(original.session.workspace);
  staleWorkspace.series.showBible = "Stale whole workspace";
  const wholeWrite = createMutationEnvelope(original, "window-b", { kind: "set-workspace", workspace: staleWorkspace }, { actionId: "workspace" });
  assert.equal(submitSessionMutation(afterLayout, wholeWrite).reason, "stale-conflict");

  const freshWorkspace = structuredClone(original.session.workspace);
  freshWorkspace.series.showBible = "Accepted first";
  const acceptedWorkspace = submitSessionMutation(original, createMutationEnvelope(original, "window-a", { kind: "set-workspace", workspace: freshWorkspace }, { actionId: "workspace-first" })).state;
  const rebasedLayout = submitSessionMutation(acceptedWorkspace, createMutationEnvelope(original, "window-b", { kind: "upsert-layout", layout: customLayout }, { actionId: "layout-second" }));
  assert.equal(rebasedLayout.disposition, "reconciled");
  assert.equal(rebasedLayout.state.session.workspace.series.showBible, "Accepted first");
  assert.ok(rebasedLayout.state.session.workspace.layouts.some((layout) => layout.id === "custom-layout"));
});

test("document-wide and block-level stale writes conflict within the same document", () => {
  const original = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const changedBlock = { ...original.session.documents[0].blocks[0], text: "Granular edit" };
  const afterBlock = submitSessionMutation(original, createMutationEnvelope(original, "window-a", {
    kind: "replace-block", documentId: "first", blockId: "one", block: changedBlock,
  }, { actionId: "block" })).state;
  const replacement = structuredClone(original.session.documents[0]);
  replacement.title = "Stale document";
  const staleDocument = submitSessionMutation(afterBlock, createMutationEnvelope(original, "window-b", {
    kind: "replace-document", documentId: "first", document: replacement,
  }, { actionId: "document" }));
  assert.equal(staleDocument.reason, "stale-conflict");
});

test("future and history-gap actions request a snapshot without mutating state", () => {
  const state = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live", revision: 4 });
  const future = createMutationEnvelope(state, "window-a", { kind: "set-project-name", name: "Future" }, { baseRevision: 5 });
  assert.equal(submitSessionMutation(state, future).disposition, "resync");
  const old = createMutationEnvelope(state, "window-a", { kind: "set-project-name", name: "Old" }, { baseRevision: 0 });
  assert.equal(submitSessionMutation(state, old).reason, "history-gap");
  assert.equal(state.session.name, "First");
});

test("granular mutation derivation identifies one-block edits and falls back for broad changes", () => {
  const before = coordinatedSession();
  const after = structuredClone(before);
  after.documents[0].blocks[1].text = "Changed";
  assert.deepEqual(deriveSessionMutation(before, after), {
    kind: "replace-block",
    documentId: "first",
    blockId: "two",
    block: after.documents[0].blocks[1],
    expectedFingerprint: blockCoordinatorFingerprint(before.documents[0].blocks[1]),
  });
  const broad = structuredClone(after);
  broad.name = "Broad";
  assert.equal(deriveSessionMutation(before, broad).kind, "replace-session");
});

test("expected block fingerprints prevent stale structural content from being overwritten", () => {
  const state = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const block = { ...state.session.documents[0].blocks[0], text: "Changed" };
  const action = createMutationEnvelope(state, "window-a", {
    kind: "replace-block", documentId: "first", blockId: "one", block,
    expectedFingerprint: "block-wrong",
  });
  const result = submitSessionMutation(state, action);
  assert.equal(result.reason, "invalid-mutation");
  assert.equal(result.state.session.documents[0].blocks[0].text, "One");
});

test("batch mutations are atomic and invalid mutations leave the prior state untouched", () => {
  const state = createSessionCoordinatorState(coordinatedSession(), { sessionId: "live" });
  const block = { id: "new", type: "action" as const, text: "New" };
  const batch = createMutationEnvelope(state, "window-a", {
    kind: "batch",
    mutations: [
      { kind: "set-project-name", name: "Batch" },
      { kind: "insert-block", documentId: "first", block },
    ],
  });
  const accepted = submitSessionMutation(state, batch);
  assert.equal(accepted.state.session.name, "Batch");
  assert.equal(accepted.state.session.documents[0].blocks.at(-1)?.id, "new");

  const invalid = createMutationEnvelope(accepted.state, "window-a", {
    kind: "batch",
    mutations: [
      { kind: "set-project-name", name: "Should roll back" },
      { kind: "remove-block", documentId: "first", blockId: "missing" },
    ],
  });
  const rejected = submitSessionMutation(accepted.state, invalid);
  assert.equal(rejected.disposition, "rejected");
  assert.equal(rejected.state.session.name, "Batch");
});

test("save queue preserves revision order even when persistence is asynchronous", async () => {
  const calls: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = new SerializedSessionSaveQueue({
    async save(_session, revision) {
      calls.push(`start-${revision}`);
      if (revision === 1) await firstGate;
      calls.push(`end-${revision}`);
    },
  });
  const session = coordinatedSession();
  const first = queue.enqueue(session, 1);
  const second = queue.enqueue({ ...session, name: "Second" }, 2);
  await Promise.resolve();
  assert.deepEqual(calls, ["start-1"]);
  releaseFirst();
  await Promise.all([first, second, queue.flush()]);
  assert.deepEqual(calls, ["start-1", "end-1", "start-2", "end-2"]);
  await assert.rejects(queue.enqueue(session, 1), /older/i);
});
