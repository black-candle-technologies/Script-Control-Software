import assert from "node:assert/strict";
import test from "node:test";
import {
  createProjectSession,
  documentsForPortableStorage,
  materializeFountainSource,
  normalizeProjectSession,
  reconcileImportedDocument,
  relinkDetachedFdxDocument,
  restoreLocalDocumentState,
  restoreLocalWorkspaceState,
  syncSeriesDocuments,
  workspaceForPortableStorage,
} from "./projectWorkspace.ts";
import { deriveScenes, emptyDocument, emptyWorkspace, screenplayTextFingerprint, type ScreenplayDocument } from "./screenplay.ts";
import { parseFountain, toFountain } from "./fountain.ts";
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
  assert.deepEqual(session.versionHistory.draftReviews, []);
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

test("Fountain source materialization preserves imported metadata and the external baseline", () => {
  const document = parseFountain("Title: Metadata\nAuthor: Writer\n\nINT. ROOM - DAY\n\nOriginal action.\n");
  document.id = "linked";
  document.titlePage.blocks = [{ type: "Contact", text: "writer@example.test", metadata: { Align: "Center" } }];
  document.blocks[1] = {
    ...document.blocks[1],
    originalType: "Action",
    metadata: { Id: "action-1", Alignment: "Left" },
    textRuns: [{ text: "Original action.", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } }],
  };
  const baseline = screenplayTextFingerprint(document);
  document.source = {
    type: "fdx",
    path: "C:/Writer/metadata.fdx",
    fileName: "metadata.fdx",
    lastImportedAt: "now",
    lastImportedFingerprint: baseline,
  };
  const session = createProjectSession(document);
  const fountain = toFountain(document);

  const unchanged = materializeFountainSource(session, "linked", fountain);
  assert.strictEqual(unchanged, session);
  assert.deepEqual(unchanged.documents[0].titlePage.blocks, document.titlePage.blocks);
  assert.deepEqual(unchanged.documents[0].blocks[1].textRuns, document.blocks[1].textRuns);

  const edited = materializeFountainSource(session, "linked", fountain.replace("Original action.", "Locally rewritten action."));
  const editedDocument = edited.documents[0];
  assert.equal(editedDocument.blocks[1].text, "Locally rewritten action.");
  assert.equal(editedDocument.blocks[1].originalType, "Action");
  assert.deepEqual(editedDocument.blocks[1].metadata, document.blocks[1].metadata);
  assert.equal(editedDocument.blocks[1].textRuns, undefined);
  assert.deepEqual(editedDocument.titlePage.blocks, document.titlePage.blocks);
  assert.equal(editedDocument.source?.lastImportedFingerprint, baseline);

  const external = parseFountain("Title: Metadata\nAuthor: Writer\n\nINT. ROOM - DAY\n\nExternally rewritten action.\n");
  external.source = { ...document.source, lastImportedAt: "later" };
  const reimported = reconcileImportedDocument(edited, "linked", external).documents[0];
  assert.equal(reimported.blocks[1].text, "Externally rewritten action.");
  assert.equal(reimported.source?.lastImportedFingerprint, screenplayTextFingerprint(reimported));
});

test("detached FDX relinking preserves local edits and exposes two-sided conflicts", () => {
  const fdxDocument = (text: string, path: string): ScreenplayDocument => {
    const document = parseFountain(`INT. ROOM - DAY\n\n${text}\n`);
    document.id = "linked";
    document.source = {
      type: "fdx",
      path,
      fileName: "shared.fdx",
      lastImportedAt: "now",
      lastImportedModifiedAt: path ? 200 : undefined,
      lastImportedFingerprint: screenplayTextFingerprint(document),
    };
    return document;
  };

  const detached = fdxDocument("Original action.", "");
  const baseline = detached.source!.lastImportedFingerprint!;
  const localSession = createProjectSession(detached);
  localSession.documents[0].blocks[1].text = "Local action.";
  const unchangedExternal = fdxDocument("Original action.", "C:/Watch/shared.fdx");
  unchangedExternal.source!.lastImportedFingerprint = baseline;
  const relinked = relinkDetachedFdxDocument(localSession, "linked", unchangedExternal);
  assert.equal(relinked.disposition, "relinked");
  assert.equal(relinked.localChanged, true);
  assert.equal(relinked.externalChanged, false);
  assert.equal(relinked.session.documents[0].blocks[1].text, "Local action.");
  assert.equal(relinked.session.documents[0].source?.path, "C:/Watch/shared.fdx");
  assert.equal(relinked.session.documents[0].source?.lastImportedFingerprint, baseline);

  const changedExternal = fdxDocument("External action.", "C:/Watch/shared.fdx");
  const conflict = relinkDetachedFdxDocument(localSession, "linked", changedExternal);
  assert.equal(conflict.disposition, "conflict");
  assert.equal(conflict.localChanged, true);
  assert.equal(conflict.externalChanged, true);
  assert.equal(conflict.session.documents[0].blocks[1].text, "Local action.");
  assert.equal(conflict.session.documents[0].source?.path, "C:/Watch/shared.fdx");

  const cleanSession = createProjectSession(fdxDocument("Original action.", ""));
  const updated = relinkDetachedFdxDocument(cleanSession, "linked", changedExternal);
  assert.equal(updated.disposition, "updated");
  assert.equal(updated.session.documents[0].blocks[1].text, "External action.");
  assert.equal(updated.session.documents[0].source?.lastImportedFingerprint, screenplayTextFingerprint(updated.session.documents[0]));
});

test("normalization preserves portable FDX beat board metadata", () => {
  const document = emptyDocument("Beat board");
  document.workspace!.storyStructure = {
    acts: [{ id: "act-1", title: "Act I" }],
    sequences: [],
    sceneOrder: [],
    beats: [{ id: "beat-a", title: "Arrival", text: "The team arrives.", color: "#AAAABBBBCCCC", board: { left: 40, top: 60, width: 240, height: 160 }, status: "drafted", moments: [], source: "fdx" }],
    connections: [{ id: "link-a", fromId: "beat-a", toId: "beat-a", color: "#111122223333", frontCap: "None", endCap: "Arrow", board: { left: 100, top: 80, width: 40, height: 20 } }],
    board: { id: "board-1", width: 2000, height: 1000, zoomLevel: 110.5, scrollOrigin: "20,40" },
  };

  const structure = normalizeProjectSession({ documents: [document] }).documents[0].workspace!.storyStructure!;
  assert.equal(structure.beats[0].title, "Arrival");
  assert.deepEqual(structure.beats[0].board, { left: 40, top: 60, width: 240, height: 160 });
  assert.equal(structure.connections?.[0].endCap, "Arrow");
  assert.deepEqual(structure.connections?.[0].board, { left: 100, top: 80, width: 40, height: 20 });
  assert.deepEqual(structure.board, { id: "board-1", width: 2000, height: 1000, zoomLevel: 110.5, scrollOrigin: "20,40" });
});

test("FDX re-import replaces external beats by stable id and keeps SCS beats", () => {
  const previous = parseFountain("INT. ROOM - DAY\n\nOriginal.\n");
  previous.id = "linked";
  previous.workspace = { ...emptyWorkspace(), storyStructure: {
    acts: [{ id: "act-1", title: "Act I" }],
    sequences: [],
    sceneOrder: [previous.blocks[0].id],
    beats: [
      { id: "local", title: "Local", text: "Keep me", status: "idea", moments: [], source: "scs" },
      { id: "external", title: "Old", text: "Old body", status: "drafted", moments: [], source: "fdx" },
      { id: "removed", title: "Removed", text: "Gone upstream", status: "drafted", moments: [], source: "fdx" },
    ],
    connections: [{ id: "old-link", fromId: "external", toId: "removed" }],
  } };
  const session = createProjectSession(previous);
  const imported = parseFountain("INT. ROOM - DAY\n\nExternal edit.\n");
  imported.workspace = { ...emptyWorkspace(), storyStructure: {
    acts: [{ id: "act-1", title: "Act I" }],
    sequences: [],
    sceneOrder: [imported.blocks[0].id],
    beats: [{ id: "external", title: "Updated", text: "Updated body", status: "drafted", moments: [], source: "fdx" }],
    connections: [],
  } };

  const structure = reconcileImportedDocument(session, "linked", imported).documents[0].workspace!.storyStructure!;
  assert.deepEqual(structure.beats.map((beat) => [beat.id, beat.title]), [["local", "Local"], ["external", "Updated"]]);
  assert.deepEqual(structure.connections, []);
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
