import assert from "node:assert/strict";
import test from "node:test";
import {
  createProjectSession,
  documentsForPortableStorage,
  normalizeProjectSession,
  reconcileImportedDocument,
  restoreLocalDocumentState,
  restoreLocalWorkspaceState,
  syncSeriesDocuments,
  workspaceForPortableStorage,
} from "./projectWorkspace.ts";
import { deriveScenes, emptyDocument } from "./screenplay.ts";
import { parseFountain } from "./fountain.ts";
import { getWorkspaceLayout } from "./workspaceLayouts.ts";

test("a project session gives every document stable shared-series metadata", () => {
  const pilot = emptyDocument("Pilot");
  const session = createProjectSession(pilot, "television");
  const second = emptyDocument("Episode 2");
  session.documents.push(second);
  syncSeriesDocuments(session.workspace.series, session.documents);

  assert.equal(Object.keys(session.workspace.series.episodes).length, 2);
  assert.deepEqual(session.workspace.series.seasons[0].episodeIds, [pilot.id, second.id]);
  assert.equal(session.workspace.series.episodes[second.id!].title, "Episode 2");
});

test("normalization migrates an older bundle and rejects malformed documents", () => {
  const document = emptyDocument("Legacy");
  delete document.id;
  const session = normalizeProjectSession({ name: "Legacy Project", projectType: "featureFilm", documents: [document], versions: [] });
  assert.equal(session.schemaVersion, 4);
  assert.match(session.documents[0].id!, /^document-/);
  assert.equal(session.workspace.collaborators[0].role, "owner");
  assert.throws(() => normalizeProjectSession({ documents: [{ titlePage: {}, blocks: [{ type: "action" }] }] }), /block 1/i);
});

test("normalization repairs duplicate block ids before the editor renders", () => {
  const document = emptyDocument("Duplicates");
  document.blocks = [
    { id: "same", type: "action", text: "One" },
    { id: "same", type: "dialogue", text: "Two" },
  ];
  const session = normalizeProjectSession({ documents: [document] });
  assert.equal(new Set(session.documents[0].blocks.map((block) => block.id)).size, 2);
});

test("normalization repairs duplicate document and history identities deterministically", () => {
  const first = emptyDocument("First");
  first.id = "duplicate";
  const second = emptyDocument("Second");
  second.id = "duplicate";
  const snapshotSession = createProjectSession(emptyDocument("Snapshot"));
  const snapshot = { id: "snapshot", name: "Snapshot", description: "", createdAt: "now", parentIds: [], session: snapshotSession };
  const session = normalizeProjectSession({
    documents: [first, second],
    versionHistory: {
      snapshots: [snapshot, structuredClone(snapshot)],
      branches: [
        { id: "branch", name: "Branch", baseSnapshotId: "snapshot", headSnapshotId: "snapshot" },
        { id: "branch", name: "Duplicate", baseSnapshotId: "snapshot", headSnapshotId: "snapshot" },
      ],
      milestones: [
        { id: "milestone", name: "Milestone", description: "", snapshotId: "snapshot" },
        { id: "milestone", name: "Duplicate", description: "", snapshotId: "snapshot" },
      ],
      activeBranchId: "branch",
    },
  });
  assert.deepEqual(session.documents.map((document) => document.id), ["duplicate", "duplicate-2"]);
  assert.equal(session.versionHistory.snapshots.length, 1);
  assert.equal(session.versionHistory.branches.length, 1);
  assert.equal(session.versionHistory.milestones.length, 1);
});

test("normalization repairs hostile workspace records before initial render", () => {
  const session = normalizeProjectSession({
    documents: [{
      ...emptyDocument("Hostile"),
      workspace: {
        treatments: [{}],
        entityOverrides: [null],
        plotThreads: [{ id: "bad" }],
        revisionSets: [{}],
        pageLock: { pages: [null, { number: "one", blockIds: null }] },
        storyStructure: { acts: [null], sequences: {}, beats: [] },
      },
    }],
    workspace: {
      layouts: [{
        id: "broken", name: "Broken", navigator: "left", inspector: "right", reference: "none",
        navigatorWidth: 240, inspectorWidth: 360, panels: [null], tabGroups: [{}], splits: [], floatingPanels: [], synchronizedPanels: [],
      }],
      series: { seasons: [null], episodes: { bad: null }, continuity: [null] },
    },
  });
  const workspace = session.documents[0].workspace!;
  assert.deepEqual(workspace.treatments, []);
  assert.deepEqual(workspace.entityOverrides, []);
  assert.deepEqual(workspace.plotThreads, []);
  assert.deepEqual(workspace.revisionSets, []);
  assert.deepEqual(workspace.pageLock?.pages, []);
  assert.equal(workspace.storyStructure, undefined);
  assert.equal(getWorkspaceLayout(session.workspace, "broken")?.id, "broken");
  assert.equal(getWorkspaceLayout(session.workspace, session.workspace.activeLayoutId)?.id, "writer");
});

test("normalization repairs malformed collaborators, local identity, and sync settings", () => {
  const document = emptyDocument("Shared");
  const session = normalizeProjectSession({
    documents: [document],
    workspace: {
      collaborators: [
        { id: "reader", name: "Reader", role: "reader" },
        { id: "reader", name: "Duplicate", role: "owner" },
        { id: "bad", name: "Bad", role: "administrator" },
      ],
      currentUserId: "missing",
      sync: { mode: "unsafe", watchRecursive: "yes" },
    },
  });
  assert.equal(session.workspace.collaborators.filter((item) => item.role === "owner").length, 1);
  assert.ok(session.workspace.collaborators.some((item) => item.id === session.workspace.currentUserId && item.role === "owner"));
  assert.equal(session.workspace.sync.mode, "none");
  assert.equal(session.workspace.sync.watchRecursive, true);
});

test("normalization drops malformed collaboration records and trims duplicate identities", () => {
  const session = normalizeProjectSession({
    documents: [emptyDocument("Untrusted shared project")],
    workspace: {
      collaborators: [
        { id: " owner ", name: "Owner", role: "owner" },
        { id: "owner", name: "Duplicate", role: "reader" },
      ],
      reviews: [null, { id: "good-review", kind: "comment", authorId: "owner", targetType: "project", targetId: "project", text: "Keep", status: "open", createdAt: "now" }, { id: "broken" }],
      approvals: [null, { id: "good-approval", versionId: "draft", reviewerId: "owner", decision: "pending", note: "", updatedAt: "now" }],
      writerRoom: { active: true, agenda: "Agenda", tasks: [null, { id: "good-task", text: "Task", done: false }, { id: "bad-task", done: "no" }] },
    },
  });
  assert.deepEqual(session.workspace.collaborators.map((item) => item.id), ["owner"]);
  assert.deepEqual(session.workspace.reviews.map((item) => item.id), ["good-review"]);
  assert.deepEqual(session.workspace.approvals, []);
  assert.deepEqual(session.workspace.writerRoom.tasks.map((item) => item.id), ["good-task"]);
});

test("portable workspaces exclude machine identity, paths, and Git author preferences", () => {
  const local = createProjectSession(emptyDocument("Portable")).workspace;
  local.currentUserId = local.collaborators[0].id;
  local.sync.folderPath = "Z:/Creator/Shared/scs.project.json";
  local.sync.watchFolderPath = "C:/Writer/FDX";
  local.sync.gitAuthorName = "Writer workstation";
  local.sync.gitAuthorEmail = "writer@example.test";
  const portable = workspaceForPortableStorage(local);
  assert.equal(portable.sync.folderPath, "");
  assert.equal(portable.sync.watchFolderPath, "");
  assert.equal(portable.sync.gitAuthorName, "");
  const reopened = restoreLocalWorkspaceState(portable, local);
  assert.equal(reopened.sync.watchFolderPath, "C:/Writer/FDX");
  assert.equal(reopened.sync.gitAuthorName, "Writer workstation");
});

test("portable documents strip machine paths and restore them only from local state", () => {
  const document = emptyDocument("Linked");
  document.source = {
    type: "fdx",
    path: "C:/Writer/Private/linked.fdx",
    fileName: "linked.fdx",
    lastImportedAt: "now",
    lastImportedModifiedAt: 123,
    lastImportedFingerprint: "script-baseline",
  };
  const portable = documentsForPortableStorage([document]);
  assert.equal(portable[0].source?.path, "");
  assert.equal(portable[0].source?.lastImportedModifiedAt, undefined);
  assert.equal(portable[0].source?.lastImportedFingerprint, "script-baseline");
  const restored = restoreLocalDocumentState(portable, [document]);
  assert.equal(restored[0].source?.path, "C:/Writer/Private/linked.fdx");
  assert.equal(restored[0].source?.lastImportedModifiedAt, 123);
});

test("session-level re-import remaps series, review, and writer-room scene targets", () => {
  const previous = parseFountain("INT. HOME - DAY\n\nKeep.\n");
  previous.id = "episode";
  const oldSceneId = deriveScenes(previous.blocks)[0].id;
  const session = createProjectSession(previous, "television");
  session.workspace.series.episodes.episode.actBreakSceneIds = [oldSceneId];
  session.workspace.series.episodes.episode.storyLines = [{ id: "a", label: "A story", kind: "A", sceneIds: [oldSceneId] }];
  session.workspace.reviews.push({ id: "review", kind: "comment", authorId: "local-owner", targetType: "scene", targetId: oldSceneId, documentId: "episode", text: "Note", status: "open", createdAt: "now" });
  session.workspace.writerRoom = {
    active: true,
    agenda: "Rewrite",
    activeDocumentId: "episode",
    activeSceneId: oldSceneId,
    tasks: [{ id: "task", text: "Rewrite scene", documentId: "episode", sceneId: oldSceneId, done: false }],
  };
  const parsed = parseFountain("An opener.\n\nEXT. ROAD - NIGHT\n\nKeep.\n");
  const reconciled = reconcileImportedDocument(session, "episode", parsed);
  const nextSceneId = deriveScenes(reconciled.documents[0].blocks)[0].id;
  assert.notEqual(nextSceneId, oldSceneId);
  assert.deepEqual(reconciled.workspace.series.episodes.episode.actBreakSceneIds, [nextSceneId]);
  assert.deepEqual(reconciled.workspace.series.episodes.episode.storyLines[0].sceneIds, [nextSceneId]);
  assert.equal(reconciled.workspace.reviews[0].targetId, nextSceneId);
  assert.equal(reconciled.workspace.writerRoom.activeSceneId, nextSceneId);
  assert.equal(reconciled.workspace.writerRoom.tasks[0].sceneId, nextSceneId);
});

test("legacy per-document comments surface in the project review workflow", () => {
  const document = emptyDocument("Legacy comments");
  document.workspace!.comments = [{ id: "note-1", author: "Local writer", text: "Keep this note visible.", resolved: false, createdAt: "2026-01-01" }];
  const session = normalizeProjectSession({ documents: [document] });
  assert.deepEqual(session.workspace.reviews.map((review) => ({ kind: review.kind, targetType: review.targetType, documentId: review.documentId, text: review.text })), [{
    kind: "comment",
    targetType: "episode",
    documentId: session.documents[0].id,
    text: "Keep this note visible.",
  }]);
});
