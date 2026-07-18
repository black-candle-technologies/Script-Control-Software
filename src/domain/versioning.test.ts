import assert from "node:assert/strict";
import test from "node:test";

import { defaultProjectWorkspace, normalizeProjectSession, type ProjectSession } from "./projectWorkspace.ts";
import type { ScreenplayBlock, ScreenplayDocument } from "./screenplay.ts";
import {
  addMilestone,
  compareSnapshots,
  createAlternateDraft,
  createProjectSnapshot,
  createVersionHistory,
  mergeSnapshots,
  restoreProjectSnapshot,
  saveSnapshot,
  snapshotScopeOf,
} from "./versioning.ts";

const blocks = (prefix: string): ScreenplayBlock[] => [
  { id: `${prefix}-heading`, type: "scene_heading", text: "INT. ROOM - DAY" },
  { id: `${prefix}-action`, type: "action", text: "A quiet room." },
  { id: `${prefix}-character`, type: "character", text: "MARA" },
  { id: `${prefix}-dialogue`, type: "dialogue", text: "Hello." },
];

const document = (id: string, title: string): ScreenplayDocument => ({
  id,
  title,
  titlePage: { title, author: "Writer" },
  blocks: blocks(id),
  sceneNotes: {},
});

const session = (): ProjectSession => ({
  schemaVersion: 4,
  projectId: "project-fixed",
  name: "Versioning Test",
  projectType: "television",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  documents: [document("doc-1", "Pilot"), document("doc-2", "Episode 2")],
  versions: [],
  versionHistory: { snapshots: [], branches: [], milestones: [], activeBranchId: "main" },
  workspace: defaultProjectWorkspace(),
  projectPath: "C:/projects/versioning-test",
  activeDocumentId: "doc-1",
});

const televisionSession = (): ProjectSession => {
  const value = session();
  value.workspace.series = {
    showBible: "The signal cannot cross water.",
    seasons: [
      { id: "season-1", number: 1, title: "Season 1", episodeIds: ["doc-1"], arc: "Mara finds the signal." },
      { id: "season-2", number: 2, title: "Season 2", episodeIds: ["doc-2"], arc: "The signal answers." },
    ],
    episodes: {
      "doc-1": { documentId: "doc-1", seasonId: "season-1", number: 1, title: "Pilot", productionCode: "101", coldOpen: true, tag: false, actBreakSceneIds: [], storyLines: [] },
      "doc-2": { documentId: "doc-2", seasonId: "season-2", number: 1, title: "Episode 2", productionCode: "201", coldOpen: false, tag: true, actBreakSceneIds: [], storyLines: [] },
    },
    characterArcs: { MARA: "Mara follows the signal.", ORIN: "An unrelated future-season arc." },
    continuity: [
      { id: "season-one-signal", kind: "plot", title: "Signal", detail: "The signal begins in the pilot.", episodeIds: ["doc-1"], resolved: false },
      { id: "season-two-water", kind: "plot", title: "Water", detail: "Water matters in season two.", episodeIds: ["doc-2"], resolved: false },
    ],
  };
  return value;
};

const snapshot = (value: ProjectSession, id: string, name = id) => createProjectSnapshot(value, {
  id,
  name,
  createdAt: `2026-01-0${id.length}T00:00:00.000Z`,
});

test("named project snapshots, alternate drafts, and milestones are immutable", () => {
  const project = session();
  project.documents[0].source = { type: "fdx", path: "C:/Writer/private.fdx", fileName: "private.fdx", lastImportedAt: "now", lastImportedModifiedAt: 123 };
  const base = snapshot(project, "base", "Table Read Draft");
  assert.equal(base.session.projectPath, "");
  assert.equal(base.session.documents[0].source?.path, "");
  assert.equal(base.session.workspace.sync.gitAuthorName, "");
  project.documents[0].blocks[1].text = "Changed after capture.";
  assert.equal(base.session.documents[0].blocks[1].text, "A quiet room.");

  const main = createVersionHistory(base);
  const alternate = createAlternateDraft(main, { id: "dark-ending", name: "Dark Ending", fromSnapshotId: "base" });
  const alternateSession = restoreProjectSnapshot(base);
  alternateSession.documents[0].blocks[1].text = "The room is dark.";
  const saved = saveSnapshot(alternate, snapshot(alternateSession, "dark-1"), "dark-ending");
  const released = addMilestone(saved, { id: "table-read", name: "Table Read", snapshotId: "dark-1", description: "Ready for actors." });

  assert.equal(main.branches.length, 1);
  assert.equal(alternate.branches.find((branch) => branch.id === "dark-ending")?.headSnapshotId, "base");
  assert.equal(released.branches.find((branch) => branch.id === "dark-ending")?.headSnapshotId, "dark-1");
  assert.deepEqual(released.snapshots.find((item) => item.id === "dark-1")?.parentIds, ["base"]);
  assert.equal(released.milestones[0].snapshotId, "dark-1");
  const restored = restoreProjectSnapshot(base);
  restored.name = "Mutated restore";
  assert.equal(base.session.name, "Versioning Test");
  assert.equal(restoreProjectSnapshot(base, project).documents[0].source?.path, "C:/Writer/private.fdx");
});

test("television snapshot scopes restore only their episode, season, or show-bible boundary", () => {
  const original = televisionSession();
  const legacyProject = snapshot(original, "legacy-project");
  assert.deepEqual(snapshotScopeOf(legacyProject), { kind: "project" });
  assert.equal(restoreProjectSnapshot(legacyProject).documents.length, 2);

  const episodeSnapshot = createProjectSnapshot(original, {
    id: "episode-v1",
    name: "Pilot polish",
    createdAt: "2026-02-01T00:00:00.000Z",
    scope: { kind: "episode", documentId: "doc-1" },
  });
  const scopedHistory = saveSnapshot(createVersionHistory(legacyProject), episodeSnapshot);
  const secondEpisodeSnapshot = createProjectSnapshot(original, {
    id: "episode-v2",
    name: "Pilot polish two",
    createdAt: "2026-02-01T01:00:00.000Z",
    scope: { kind: "episode", documentId: "doc-1" },
  });
  const twiceScoped = saveSnapshot(scopedHistory, secondEpisodeSnapshot);
  assert.equal(twiceScoped.branches[0].headSnapshotId, "legacy-project");
  assert.deepEqual(twiceScoped.snapshots.find((item) => item.id === "episode-v2")?.parentIds, ["episode-v1"]);
  assert.throws(() => createVersionHistory(episodeSnapshot), /project-wide/);
  assert.throws(() => createAlternateDraft(scopedHistory, { id: "bad-branch", name: "Bad branch", fromSnapshotId: "episode-v1" }), /project-wide/);
  assert.throws(() => mergeSnapshots(legacyProject, episodeSnapshot, secondEpisodeSnapshot), /project-wide/);
  const current = structuredClone(original);
  current.documents[0].blocks[1].text = "The pilot changed.";
  current.documents[1].blocks[1].text = "Episode two changed independently.";
  current.workspace.series.episodes["doc-1"].title = "Renamed Pilot";
  current.workspace.series.showBible = "New shared canon.";
  assert.throws(() => restoreProjectSnapshot(episodeSnapshot), /requires the current project/i);
  const restoredEpisode = restoreProjectSnapshot(episodeSnapshot, current);
  assert.equal(restoredEpisode.documents[0].blocks[1].text, "A quiet room.");
  assert.equal(restoredEpisode.documents[1].blocks[1].text, "Episode two changed independently.");
  assert.equal(restoredEpisode.workspace.series.episodes["doc-1"].title, "Pilot");
  assert.equal(restoredEpisode.workspace.series.showBible, "New shared canon.");
  assert.equal(restoredEpisode.activeDocumentId, "doc-1");

  const bibleSnapshot = createProjectSnapshot(original, {
    id: "bible-v1",
    name: "Series canon",
    createdAt: "2026-02-02T00:00:00.000Z",
    scope: { kind: "show-bible" },
  });
  const restoredBible = restoreProjectSnapshot(bibleSnapshot, current);
  assert.equal(restoredBible.workspace.series.showBible, "The signal cannot cross water.");
  assert.equal(restoredBible.documents[0].blocks[1].text, "The pilot changed.");

  const seasonSnapshot = createProjectSnapshot(original, {
    id: "season-v1",
    name: "Season one",
    createdAt: "2026-02-03T00:00:00.000Z",
    scope: { kind: "season", seasonId: "season-1" },
  });
  const laterSeason = structuredClone(current);
  const third = document("doc-3", "Episode 3");
  laterSeason.documents.push(third);
  laterSeason.workspace.series.episodes["doc-3"] = { documentId: "doc-3", seasonId: "season-1", number: 2, title: "Episode 3", productionCode: "102", coldOpen: false, tag: false, actBreakSceneIds: [], storyLines: [] };
  laterSeason.workspace.series.seasons[0].episodeIds.push("doc-3");
  laterSeason.workspace.series.seasons[0].arc = "A later season-one arc.";
  laterSeason.workspace.series.seasons[1].arc = "Season two keeps changing.";
  laterSeason.workspace.series.continuity.find((record) => record.id === "season-one-signal")!.detail = "Changed season-one continuity.";
  laterSeason.workspace.series.continuity.find((record) => record.id === "season-two-water")!.detail = "Changed season-two continuity.";
  laterSeason.workspace.series.characterArcs.MARA = "Changed Mara arc.";
  laterSeason.workspace.series.characterArcs.ORIN = "Changed unrelated arc.";
  laterSeason.activeDocumentId = "doc-3";
  const restoredSeason = restoreProjectSnapshot(seasonSnapshot, laterSeason);
  assert.deepEqual(restoredSeason.documents.map((item) => item.id), ["doc-1", "doc-2"]);
  assert.equal(restoredSeason.documents[0].blocks[1].text, "A quiet room.");
  assert.equal(restoredSeason.documents[1].blocks[1].text, "Episode two changed independently.");
  assert.equal(restoredSeason.workspace.series.seasons[0].arc, "Mara finds the signal.");
  assert.equal(restoredSeason.workspace.series.seasons[1].arc, "Season two keeps changing.");
  assert.equal(restoredSeason.workspace.series.showBible, "New shared canon.");
  assert.equal(restoredSeason.workspace.series.episodes["doc-3"], undefined);
  assert.equal(restoredSeason.workspace.series.continuity.find((record) => record.id === "season-one-signal")?.detail, "The signal begins in the pilot.");
  assert.equal(restoredSeason.workspace.series.continuity.find((record) => record.id === "season-two-water")?.detail, "Changed season-two continuity.");
  assert.equal(restoredSeason.workspace.series.characterArcs.MARA, "Mara follows the signal.");
  assert.equal(restoredSeason.workspace.series.characterArcs.ORIN, "Changed unrelated arc.");
  assert.equal(restoredSeason.activeDocumentId, "doc-1");

  assert.throws(() => createProjectSnapshot(original, { id: "missing", name: "Missing", createdAt: "now", scope: { kind: "episode", documentId: "missing" } }), /does not exist/);
  const feature = televisionSession();
  feature.projectType = "featureFilm";
  assert.throws(() => createProjectSnapshot(feature, { id: "wrong-kind", name: "Wrong", createdAt: "now", scope: { kind: "show-bible" } }), /television project/);
});

test("scoped comparisons ignore unrelated television changes and reject incompatible targets", () => {
  const before = televisionSession();
  const after = structuredClone(before);
  after.documents[0].blocks[1].text = "The pilot room shakes.";
  after.documents[1].blocks[1].text = "The season-two room floods.";
  after.workspace.series.showBible = "Revised shared canon.";
  after.workspace.series.continuity.find((record) => record.id === "season-one-signal")!.detail = "Pilot continuity changed.";
  after.workspace.series.continuity.find((record) => record.id === "season-two-water")!.detail = "Season-two continuity changed.";

  const episodeBefore = createProjectSnapshot(before, { id: "episode-before", name: "Before", createdAt: "2026-03-01", scope: { kind: "episode", documentId: "doc-1" } });
  const episodeAfter = createProjectSnapshot(after, { id: "episode-after", name: "After", createdAt: "2026-03-02", scope: { kind: "episode", documentId: "doc-1" } });
  const episodeBlocks = compareSnapshots(episodeBefore, episodeAfter, "block");
  assert.deepEqual(episodeBlocks.scope, { kind: "episode", documentId: "doc-1" });
  assert.deepEqual(episodeBlocks.blockChanges.map((change) => change.documentId), ["doc-1"]);
  const episodeMetadata = compareSnapshots(episodeBefore, episodeAfter, "metadata").metadataChanges;
  assert.ok(episodeMetadata.every((change) => !change.path.includes("showBible") && !change.path.includes("doc-2")));

  const projectBefore = snapshot(before, "project-before");
  assert.deepEqual(compareSnapshots(projectBefore, episodeAfter, "block").scope, { kind: "episode", documentId: "doc-1" });
  const otherEpisode = createProjectSnapshot(after, { id: "episode-two", name: "Episode two", createdAt: "2026-03-02", scope: { kind: "episode", documentId: "doc-2" } });
  assert.throws(() => compareSnapshots(episodeBefore, otherEpisode, "block"), /same episode/);

  const seasonBefore = createProjectSnapshot(before, { id: "season-before", name: "Before season", createdAt: "2026-03-01", scope: { kind: "season", seasonId: "season-1" } });
  const seasonAfter = createProjectSnapshot(after, { id: "season-after", name: "After season", createdAt: "2026-03-02", scope: { kind: "season", seasonId: "season-1" } });
  assert.deepEqual(compareSnapshots(seasonBefore, seasonAfter, "block").blockChanges.map((change) => change.documentId), ["doc-1"]);
  const seasonContinuity = JSON.stringify(compareSnapshots(seasonBefore, seasonAfter, "season").metadataChanges);
  assert.match(seasonContinuity, /Pilot continuity changed/);
  assert.doesNotMatch(seasonContinuity, /season-two-water|Season-two continuity changed/);

  const bibleBefore = createProjectSnapshot(before, { id: "bible-before", name: "Before bible", createdAt: "2026-03-01", scope: { kind: "show-bible" } });
  const bibleAfter = createProjectSnapshot(after, { id: "bible-after", name: "After bible", createdAt: "2026-03-02", scope: { kind: "show-bible" } });
  assert.deepEqual(compareSnapshots(bibleBefore, bibleAfter, "show-bible").metadataChanges.map((change) => change.path), ["/showBible"]);
  assert.deepEqual(compareSnapshots(bibleBefore, bibleAfter, "block").blockChanges, []);
});

test("snapshot scope metadata survives portable project normalization", () => {
  const project = televisionSession();
  const scoped = createProjectSnapshot(project, { id: "episode-portable", name: "Portable episode", createdAt: "2026-04-01", scope: { kind: "episode", documentId: "doc-1" } });
  project.versionHistory.snapshots = [scoped];
  project.versionHistory.branches = [{ id: "invalid-scoped-branch", name: "Invalid", baseSnapshotId: scoped.id, headSnapshotId: scoped.id }];
  const normalized = normalizeProjectSession(project);
  assert.deepEqual(normalized.versionHistory.snapshots[0].scope, { kind: "episode", documentId: "doc-1" });
  assert.deepEqual(normalized.versionHistory.branches, []);

  const malformed = structuredClone(project) as ProjectSession & { versionHistory: { snapshots: Array<Record<string, unknown>> } };
  malformed.versionHistory.snapshots[0].scope = { kind: "episode", documentId: "missing" };
  assert.deepEqual(normalizeProjectSession(malformed).versionHistory.snapshots, []);
});

test("arbitrary snapshot comparisons expose document, block, and metadata modes", () => {
  const before = session();
  const after = structuredClone(before);
  after.documents[0].titlePage.title = "Revised Pilot";
  after.documents[0].blocks[1].text = "The room shakes.";
  after.documents[0].blocks.splice(1, 0, { id: "doc-1-new", type: "action", text: "A clock stops." });
  const character = after.documents[0].blocks.findIndex((block) => block.id === "doc-1-character");
  const dialogue = after.documents[0].blocks.findIndex((block) => block.id === "doc-1-dialogue");
  [after.documents[0].blocks[character], after.documents[0].blocks[dialogue]] = [after.documents[0].blocks[dialogue], after.documents[0].blocks[character]];
  after.documents.pop();
  after.documents.push(document("doc-3", "Episode 3"));
  after.workspace.series.showBible = "The signal cannot cross water.";
  const base = snapshot(before, "base");
  const revised = snapshot(after, "revised");

  const documents = compareSnapshots(base, revised, "document");
  assert.deepEqual(documents.documentChanges.map((change) => [change.documentId, change.kind]), [
    ["doc-1", "modified"],
    ["doc-2", "removed"],
    ["doc-3", "added"],
  ]);
  assert.equal(documents.documentChanges[0].before?.titlePage.title, "Pilot");
  assert.equal(documents.documentChanges[0].after?.titlePage.title, "Revised Pilot");
  assert.equal(documents.documentChanges[1].after, undefined);
  assert.equal(documents.documentChanges[2].before, undefined);

  const blockChanges = compareSnapshots(base, revised, "block").blockChanges;
  assert.ok(blockChanges.some((change) => change.blockId === "doc-1-action" && change.kind === "edited"));
  assert.ok(blockChanges.some((change) => change.blockId === "doc-1-new" && change.kind === "added"));
  assert.ok(blockChanges.some((change) => change.blockId === "doc-1-character" && change.kind === "moved"));
  assert.ok(blockChanges.some((change) => change.documentId === "doc-2" && change.kind === "removed"));
  assert.ok(blockChanges.some((change) => change.documentId === "doc-3" && change.kind === "added"));

  const metadata = compareSnapshots(base, revised, "metadata").metadataChanges;
  assert.ok(metadata.some((change) => change.path === "/workspace/series/showBible"));
  assert.ok(metadata.some((change) => change.path === "/documents/doc-1/titlePage/title"));
  assert.ok(metadata.every((change) => !change.path.includes("/blocks/")));

  assert.ok(compareSnapshots(base, revised, "page").metadataChanges.length > 0);
  assert.ok(compareSnapshots(base, revised, "scene").metadataChanges.length > 0);
  assert.equal(compareSnapshots(base, revised, "dialogue").blockChanges.filter((change) => change.documentId === "doc-1").length, 2);
  assert.ok(compareSnapshots(base, revised, "character").metadataChanges.length > 0);
  assert.ok(compareSnapshots(base, revised, "episode").metadataChanges.length > 0);
  assert.ok(compareSnapshots(base, revised, "season").metadataChanges.length > 0);
});

test("three-way merge combines independent edits and reports deterministic edit and deletion conflicts", () => {
  const ancestor = session();
  const ours = structuredClone(ancestor);
  const theirs = structuredClone(ancestor);

  ours.workspace.series.showBible = "Our canon.";
  ours.documents[0].blocks.find((block) => block.id === "doc-1-action")!.text = "Our room burns.";
  ours.documents[0].blocks.find((block) => block.id === "doc-1-character")!.text = "MARA PRIME";
  ours.documents[0].blocks.splice(2, 0, { id: "ours-new", type: "action", text: "Our new beat." });
  ours.documents[0].sceneNotes["doc-1-heading"] = "Keep our staging.";

  theirs.workspace.series.showBible = "Their canon.";
  theirs.documents[0].blocks.find((block) => block.id === "doc-1-action")!.text = "Their room floods.";
  theirs.documents[0].blocks = theirs.documents[0].blocks.filter((block) => block.id !== "doc-1-character");
  theirs.documents[0].blocks.splice(2, 0, { id: "theirs-new", type: "action", text: "Their new beat." });
  theirs.documents[0].workspace = { treatment: "Their treatment.", showBible: "", continuity: "", seasonArc: "", productionNotes: "", comments: [], entityStatuses: {} };
  theirs.documents[1].blocks.find((block) => block.id === "doc-2-action")!.text = "Episode two changes independently.";

  const baseSnapshot = snapshot(ancestor, "base");
  const ourSnapshot = snapshot(ours, "ours");
  const theirSnapshot = snapshot(theirs, "theirs");
  const result = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot);
  const repeated = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot);

  assert.deepEqual(result, repeated);
  assert.equal(result.clean, false);
  assert.deepEqual(result.conflicts.map((conflict) => [conflict.path, conflict.kind]), [
    ["/workspace/series/showBible", "value"],
    ["/documents/doc-1/blocks/doc-1-action/text", "value"],
    ["/documents/doc-1/blocks/doc-1-character", "delete-edit"],
  ]);
  assert.equal(result.merged.workspace.series.showBible, "Our canon.");
  assert.equal(result.merged.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "Our room burns.");
  assert.equal(result.merged.documents[0].blocks.find((block) => block.id === "doc-1-character")?.text, "MARA PRIME");
  assert.ok(result.merged.documents[0].blocks.some((block) => block.id === "ours-new"));
  assert.ok(result.merged.documents[0].blocks.some((block) => block.id === "theirs-new"));
  assert.equal(result.merged.documents[0].workspace?.treatment, "Their treatment.");
  assert.equal(result.merged.documents[0].sceneNotes["doc-1-heading"], "Keep our staging.");
  assert.equal(result.merged.documents[1].blocks.find((block) => block.id === "doc-2-action")?.text, "Episode two changes independently.");
  assert.equal(ancestor.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "A quiet room.");

  const preferTheirs = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot, "theirs");
  assert.equal(preferTheirs.merged.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "Their room floods.");
  assert.ok(!preferTheirs.merged.documents[0].blocks.some((block) => block.id === "doc-1-character"));

  const perConflict = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot, {
    default: "ours",
    paths: { "/workspace/series/showBible": "theirs", "/documents/doc-1/blocks/doc-1-character": "theirs" },
  });
  assert.equal(perConflict.merged.workspace.series.showBible, "Their canon.");
  assert.equal(perConflict.merged.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "Our room burns.");
  assert.ok(!perConflict.merged.documents[0].blocks.some((block) => block.id === "doc-1-character"));
});

test("three-way merge preserves independent ID-keyed collaboration and history additions in deterministic order", () => {
  const ancestor = session();
  const ours = structuredClone(ancestor);
  const theirs = structuredClone(ancestor);
  const timestamp = "2026-07-18T12:00:00.000Z";

  ours.workspace.reviews.push({ id: "review-z", kind: "comment", authorId: "local-owner", targetType: "project", targetId: ancestor.projectId, text: "Our note", status: "open", createdAt: timestamp });
  theirs.workspace.reviews.push({ id: "review-a", kind: "comment", authorId: "local-owner", targetType: "project", targetId: ancestor.projectId, text: "Their note", status: "open", createdAt: timestamp });
  ours.workspace.writerRoom.tasks.push({ id: "task-z", text: "Our task", done: false });
  theirs.workspace.writerRoom.tasks.push({ id: "task-a", text: "Their task", done: false });
  ours.workspace.approvals.push({ id: "approval-z", versionId: "history-z", reviewerId: "local-owner", decision: "pending", note: "", updatedAt: timestamp });
  theirs.workspace.approvals.push({ id: "approval-a", versionId: "history-a", reviewerId: "local-owner", decision: "pending", note: "", updatedAt: timestamp });
  ours.versionHistory.snapshots.push(snapshot(ancestor, "history-z"));
  theirs.versionHistory.snapshots.push(snapshot(ancestor, "history-a"));

  const mergeInput = (value: ProjectSession, id: string) => ({ ...snapshot(value, id), session: structuredClone(value) });
  const baseSnapshot = mergeInput(ancestor, "base");
  const result = mergeSnapshots(baseSnapshot, mergeInput(ours, "ours"), mergeInput(theirs, "theirs"));
  const repeated = mergeSnapshots(baseSnapshot, mergeInput(ours, "ours"), mergeInput(theirs, "theirs"));

  assert.equal(result.clean, true);
  assert.deepEqual(result, repeated);
  assert.deepEqual(result.merged.workspace.reviews.map((item) => item.id), ["review-z", "review-a"]);
  assert.deepEqual(result.merged.workspace.writerRoom.tasks.map((item) => item.id), ["task-z", "task-a"]);
  assert.deepEqual(result.merged.workspace.approvals.map((item) => item.id), ["approval-z", "approval-a"]);
  assert.deepEqual(result.merged.versionHistory.snapshots.map((item) => item.id), ["history-z", "history-a"]);
});

test("same-ID record conflicts stay explicit while primitive arrays remain atomic", () => {
  const ancestor = session();
  const ours = structuredClone(ancestor);
  const theirs = structuredClone(ancestor);
  const timestamp = "2026-07-18T12:00:00.000Z";
  const review = { id: "shared-review", kind: "comment" as const, authorId: "local-owner", targetType: "project" as const, targetId: ancestor.projectId, status: "open" as const, createdAt: timestamp };

  ours.workspace.reviews.push({ ...review, text: "Our wording" });
  theirs.workspace.reviews.push({ ...review, text: "Their wording" });
  ancestor.workspace.series.seasons[0].episodeIds = ["base-episode"];
  ours.workspace.series.seasons[0].episodeIds = ["base-episode", "ours-episode"];
  theirs.workspace.series.seasons[0].episodeIds = ["base-episode", "theirs-episode"];

  const result = mergeSnapshots(snapshot(ancestor, "base"), snapshot(ours, "ours"), snapshot(theirs, "theirs"));

  assert.deepEqual(result.conflicts.map((conflict) => [conflict.path, conflict.kind]), [
    ["/workspace/reviews/shared-review/text", "add-add"],
    ["/workspace/series/seasons/season-1/episodeIds", "value"],
  ]);
  assert.equal(result.merged.workspace.reviews[0].text, "Our wording");
  assert.deepEqual(result.merged.workspace.series.seasons[0].episodeIds, ["base-episode", "ours-episode"]);
});
